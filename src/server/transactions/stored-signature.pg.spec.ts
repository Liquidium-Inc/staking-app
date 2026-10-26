/**
 * Runs the stake/unstake prepare, confirm and monitor routes against real Postgres (PGlite,
 * in-process) with valid signed PSBTs, the real BroadcastService and the local canister signer.
 * Only the external services are faked: the Bitcoin network (mempool API) and Redis locks.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { ECPairFactory } from 'ecpair';
import { NextRequest } from 'next/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as monitorStake } from '@/app/api/cron/monitor/stake/route';
import { GET as monitorUnstake } from '@/app/api/cron/monitor/unstake/route';
import { POST as confirmStake } from '@/app/api/stake/confirm/route';
import { POST as prepareStake } from '@/app/api/stake/route';
import { POST as confirmUnstake } from '@/app/api/unstake/confirm/route';
import { POST as prepareUnstake } from '@/app/api/unstake/route';
import { config } from '@/config/config';
import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { backfillSignedPsbtState } from '@/db/backfill-signed-psbt-state';
import { sql } from '@/db/client';
import { stakes, unstakes } from '@/db/schema';
import { CANISTER_CLAIM_STALE_MS, CANISTER_SIGNATURE_MAX_AGE_MS } from '@/lib/canister-signature';
import { RunePSBT, RunePSBTInput } from '@/lib/psbt';
import { canister } from '@/providers/canister';

import { MONITOR_LIMITS } from './monitor';
import { broadcastWithStoredSignature } from './stored-signature';

bitcoin.initEccLib(ecc);

const net = vi.hoisted(() => ({
  // txid -> status; what the mempool API knows
  txs: new Map<string, { confirmed: boolean; block_height?: number }>(),
  posted: [] as string[],
  // Accepted txs stay invisible to lookups while lagging
  lagging: false,
  lookupFails: false,
  loseResponse: false,
  // Lookups for these txids never answer
  slow: new Set<string>(),
  hold: undefined as Promise<void> | undefined,
  build: { psbt: '', toSign: [] as number[] },
}));

vi.mock('@/db/client', async () => {
  const { PGlite: Pg } = await import('@electric-sql/pglite');
  const { drizzle: connect } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  return { sql: connect(new Pg(), { schema }), schema };
});

vi.mock('@/providers/mempool', async () => {
  const lib = await import('bitcoinjs-lib');
  const axiosError = (status: number, data: string) =>
    Object.assign(new Error(data), { isAxiosError: true, response: { status, data } });
  return {
    mempool: {
      blocks: { getBlocksTipHeight: async () => 1000 },
      transactions: {
        getTxStatus: async ({ txid }: { txid: string }) => {
          if (net.lookupFails) throw axiosError(502, 'bad gateway');
          if (net.slow.has(txid)) await new Promise(() => {});
          const status = net.txs.get(txid);
          if (!status || (net.lagging && !status.confirmed)) {
            throw axiosError(404, 'Transaction not found');
          }
          return status;
        },
        postTx: async ({ txhex }: { txhex: string }) => {
          await net.hold;
          const txid = lib.Transaction.fromHex(txhex).getId();
          if (net.txs.has(txid)) throw axiosError(400, 'txn-already-in-mempool');
          net.txs.set(txid, { confirmed: false });
          net.posted.push(txid);
          if (net.loseResponse) throw new Error('socket hang up');
        },
      },
    },
  };
});

vi.mock('@/services/psbt', async (importOriginal) => {
  const mod = await importOriginal<{ PSBTService: unknown }>();
  return {
    PSBTService: Object.assign(
      vi.fn(function PSBTServiceMock() {
        return { build: async () => ({ ...net.build, feeRate: 2 }) };
      }),
      mod.PSBTService,
    ),
  };
});

vi.mock('@/providers/redis', () => ({
  redis: { utxo: { extend: async () => true, free: async () => true, lock: async () => true } },
}));

vi.mock('@/server/auth/session', () => ({
  requireSession: async () => ({ address: 'session' }),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

// Only the session wallet matches, so ownership passes and protocol wallets never pay fees
vi.mock('@/lib/address', () => ({ addressesMatch: (a: string) => a === 'session' }));

const network = bitcoin.networks.testnet;
const ECPair = ECPairFactory(ecc);
const user = ECPair.makeRandom({ network });
const userPublicKey = Buffer.from(user.publicKey).toString('hex');
const userRuneAddress = bitcoin.payments.p2tr({
  pubkey: toXOnly(user.publicKey),
  network,
}).address!;
const p2wpkhPayer = bitcoin.payments.p2wpkh({ pubkey: user.publicKey, network });
const p2shPayer = bitcoin.payments.p2sh({ redeem: p2wpkhPayer, network });
const canisterPublicKey = (canister as unknown as { canisterWallet: { publicKey: string } })
  .canisterWallet.publicKey;
const { rune: runeId, sRune: sRuneId } = {
  rune: publicConfig.rune.id,
  sRune: publicConfig.sRune.id,
};

let inputCounter = 0;
const input = (payload: Partial<RunePSBTInput>): RunePSBTInput => ({
  hash: (++inputCounter).toString(16).padStart(64, 'a'),
  index: 0,
  address: '',
  publicKey: '',
  value: 546n,
  runes: {},
  ...payload,
});

/** Builds a valid unsigned stake/unstake PSBT and the user-signed copy of it. */
async function buildTx(kind: 'stake' | 'unstake', payer: 'p2wpkh' | 'p2sh') {
  const rune = new RunePSBT(network);
  if (kind === 'stake') {
    rune.addInput(
      input({
        address: canister.address,
        publicKey: canisterPublicKey,
        runes: { [sRuneId]: 5000n },
      }),
      input({ address: userRuneAddress, publicKey: userPublicKey, runes: { [runeId]: 2000n } }),
    );
    rune.addOutput(
      { address: canister.address, runes: { [sRuneId]: 4000n }, isPointer: true },
      { address: canister.address, runes: { [runeId]: 1000n } },
      { address: userRuneAddress, runes: { [runeId]: 1000n } },
      { address: userRuneAddress, runes: { [sRuneId]: 1000n } },
    );
  } else {
    rune.addInput(
      input({
        address: canister.address,
        publicKey: canisterPublicKey,
        runes: { [runeId]: 5000n },
      }),
      input({ address: userRuneAddress, publicKey: userPublicKey, runes: { [sRuneId]: 1000n } }),
    );
    rune.addOutput(
      { address: canister.address, runes: { [runeId]: 4000n }, isPointer: true },
      { address: canister.retention, runes: { [runeId]: 1000n } },
      { address: canister.address, runes: { [sRuneId]: 1000n } },
      { address: userRuneAddress, runes: {} },
    );
  }
  const payerAddress = payer === 'p2sh' ? p2shPayer.address! : p2wpkhPayer.address!;
  rune.setPayer(input({ address: payerAddress, publicKey: userPublicKey, value: 50_000n }));
  const unsigned = await rune.build(2);
  if (payer === 'p2sh') unsigned.updateInput(2, { redeemScript: p2shPayer.redeem!.output! });

  const signed = bitcoin.Psbt.fromBase64(unsigned.toBase64(), { network });
  signed.signInput(1, user);
  signed.signInput(2, user);
  const prepareTxid = (
    unsigned.data.globalMap.unsignedTx as unknown as { tx: { getId(): string } }
  ).tx.getId();
  return { unsigned: unsigned.toBase64(), signed: signed.toBase64(), prepareTxid };
}

const request = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const cronRequest = () =>
  new NextRequest('http://localhost/api/cron/monitor', {
    headers: { authorization: `Bearer ${config.secrets.cron}` },
  });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const at = (offsetMs: number) => vi.setSystemTime(T0 + offsetMs);

async function migrate(
  target: { execute: (query: string) => Promise<unknown> },
  from = 0,
  to = Infinity,
) {
  const dir = join(process.cwd(), 'drizzle');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .slice(from, to);
  for (const file of files) {
    for (const statement of readFileSync(join(dir, file), 'utf8').split(
      '--> statement-breakpoint',
    )) {
      await target.execute(statement);
    }
  }
}

beforeAll(async () => {
  await migrate(sql);
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(0);
  await sql.execute('TRUNCATE stakes, unstakes');
  net.txs.clear();
  net.posted = [];
  net.slow.clear();
  Object.assign(net, { lagging: false, lookupFails: false, loseResponse: false, hold: undefined });
});

afterEach(() => {
  vi.useRealTimers();
});

const kinds = [
  { kind: 'stake' as const, prepare: prepareStake, confirm: confirmStake, monitor: monitorStake },
  {
    kind: 'unstake' as const,
    prepare: prepareUnstake,
    confirm: confirmUnstake,
    monitor: monitorUnstake,
  },
];

describe.each(
  kinds.flatMap((k) => (['p2wpkh', 'p2sh'] as const).map((payer) => ({ ...k, payer }))),
)('$kind with a $payer payer', ({ kind, payer, prepare, confirm, monitor }) => {
  const table = db[kind];
  let tx: Awaited<ReturnType<typeof buildTx>>;

  // The canister signs again when broadcasting; at prepare time the stored "signature" is opaque
  const prepareRequest = async () => {
    vi.spyOn(canister, kind).mockImplementationOnce(async (psbt: string) => ({
      signed_psbt: psbt,
      debug: {},
    }));
    net.build = { psbt: tx.unsigned, toSign: [1, 2] };
    return prepare(
      request({
        sender: { public: userPublicKey, address: userRuneAddress },
        payer: { public: userPublicKey, address: 'payer' },
        amount: '1000',
        sAmount: '1000',
      }),
    );
  };
  const confirmRequest = () => confirm(request({ psbt: tx.signed }));
  const row = async () => (await table.getByPrepareTxid(tx.prepareTxid))!;
  const rowCount = async () =>
    (await sql.select().from(kind === 'stake' ? stakes : unstakes)).length;
  const confirmOnChain = (txid: string) =>
    net.txs.set(txid, { confirmed: true, block_height: 990 });

  beforeEach(async () => {
    tx = await buildTx(kind, payer);
    expect((await prepareRequest()).status).toBe(200);
  });

  it('broadcasts the finalized tx and records its network txid', async () => {
    const response = await confirmRequest();

    expect(response.status).toBe(200);
    const { txid } = await response.json();
    expect(net.posted).toEqual([txid]);
    if (payer === 'p2sh') expect(txid).not.toBe(tx.prepareTxid);
    else expect(txid).toBe(tx.prepareTxid);
    expect(await row()).toMatchObject({ txid, prepareTxid: tx.prepareTxid, psbt: null });
  });

  it('broadcasts once when two confirms race', async () => {
    const statuses = (await Promise.all([confirmRequest(), confirmRequest()])).map((r) => r.status);

    expect(statuses.sort()).toEqual([200, 409]);
    expect(net.posted).toHaveLength(1);
  });

  it('keeps a broadcast that is in flight when a retry crosses the deadline', async () => {
    const hold = deferred();
    net.hold = hold.promise;
    at(CANISTER_SIGNATURE_MAX_AGE_MS - 1000);
    const first = confirmRequest();
    await vi.waitFor(async () => expect((await row()).txid).not.toBe(''));
    await vi.waitFor(async () => expect((await row()).claimedAt).not.toBeNull());

    at(CANISTER_SIGNATURE_MAX_AGE_MS + 1000);
    expect((await confirmRequest()).status).toBe(409);

    hold.resolve();
    expect((await first).status).toBe(200);
    expect(net.posted).toHaveLength(1);
    expect(await row()).toMatchObject({ txid: net.posted[0], invalidatedAt: null });
  });

  it('expires an unclaimed signature after the deadline and keeps the row', async () => {
    at(CANISTER_SIGNATURE_MAX_AGE_MS + 1000);

    expect((await confirmRequest()).status).toBe(410);
    expect(net.posted).toHaveLength(0);
    expect(await row()).toMatchObject({ psbt: null, invalidatedAt: expect.any(Date) });
  });

  it('treats a lost broadcast response as success when the tx reached the network', async () => {
    net.loseResponse = true;

    const response = await confirmRequest();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ txid: net.posted[0] });
    expect(await row()).toMatchObject({ txid: net.posted[0], invalidatedAt: null });
  });

  it('reconciles a lost response with a failed lookup using the network txid', async () => {
    net.loseResponse = true;
    net.lookupFails = true;
    expect((await confirmRequest()).status).toBe(400);
    expect(await row()).toMatchObject({ txid: net.posted[0], invalidatedAt: null });

    // After the claim goes stale, recovery checks the recorded network txid and finds it
    net.lookupFails = false;
    at(CANISTER_CLAIM_STALE_MS + 1000);
    expect((await confirmRequest()).status).toBe(409);
    expect((await prepareRequest()).status).toBe(409);

    confirmOnChain(net.posted[0]);
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ block: 990, invalidatedAt: null, psbt: null });
    expect(await table.getByTxid(net.posted[0])).toMatchObject({ id: (await row()).id });
    expect(net.posted).toHaveLength(1);
  });

  it('keeps one record when a lagging network makes a broadcast look failed', async () => {
    // Accepted, but the response is lost and lookups lag: the claim is invalidated
    net.loseResponse = true;
    net.lagging = true;
    expect((await confirmRequest()).status).toBe(400);
    const networkTxid = net.posted[0];
    expect(await row()).toMatchObject({ txid: networkTxid, invalidatedAt: expect.any(Date) });

    // Rebuilding the same tx reuses the same row; re-broadcasting is refused by the network
    net.loseResponse = false;
    expect((await prepareRequest()).status).toBe(200);
    expect(await rowCount()).toBe(1);
    expect((await confirmRequest()).status).toBe(400);
    expect(net.posted).toHaveLength(1);

    // The tx confirms (shallowly at first): the row is restored and its signature retired
    net.lagging = false;
    net.txs.set(networkTxid, { confirmed: true, block_height: 1000 });
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ block: null, psbt: null, invalidatedAt: null });
    confirmOnChain(networkTxid);
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ block: 990, txid: networkTxid });
    expect(await rowCount()).toBe(1);
  });

  it('retires a re-armed signature as soon as the tx is seen on the network', async () => {
    net.loseResponse = true;
    net.lagging = true;
    expect((await confirmRequest()).status).toBe(400);
    net.loseResponse = false;
    expect((await prepareRequest()).status).toBe(200);
    expect((await row()).psbt).not.toBeNull();

    // Seen in the mempool (not settled): the stored signature is dropped right away
    net.lagging = false;
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ psbt: null, invalidatedAt: null, block: null });
    expect((await confirmRequest()).status).toBe(409);
    expect(net.posted).toHaveLength(1);
  });

  it('recovers an abandoned claim once it is stale and the tx is unknown', async () => {
    await table.claimSignedPsbt((await row()).id, tx.unsigned, new Date(0));
    expect((await confirmRequest()).status).toBe(409);

    at(CANISTER_CLAIM_STALE_MS + 1000);
    expect((await confirmRequest()).status).toBe(410);
    expect((await prepareRequest()).status).toBe(200);
    expect((await confirmRequest()).status).toBe(200);
    expect(net.posted).toHaveLength(1);
  });

  it('lets the user start again straight after a stale, unknown claim', async () => {
    await table.claimSignedPsbt((await row()).id, tx.unsigned, new Date(0));
    at(CANISTER_CLAIM_STALE_MS + 1000);

    expect((await prepareRequest()).status).toBe(200);
    expect((await confirmRequest()).status).toBe(200);
    expect(net.posted).toHaveLength(1);
  });

  it('does not hand out a PSBT while a confirm is in flight', async () => {
    await table.claimSignedPsbt((await row()).id, tx.unsigned, new Date(0));

    expect((await prepareRequest()).status).toBe(409);
  });

  it('claims a signature refreshed by a concurrent prepare instead of rejecting', async () => {
    const stale = await row();
    // A concurrent prepare stored another signature for the same tx
    const other = bitcoin.Psbt.fromBase64(tx.unsigned, { network });
    other.addUnknownKeyValToGlobal({ key: Buffer.from([0xfc, 1]), value: Buffer.from([1]) });
    await table.update([stale.id], { psbt: other.toBase64() });

    const response = await broadcastWithStoredSignature(
      kind,
      stale,
      bitcoin.Psbt.fromBase64(tx.signed, { network }),
    );

    expect(response.status).toBe(200);
    expect(net.posted).toHaveLength(1);
  });

  it('never broadcasts a signature stored on a confirmed row', async () => {
    await table.update([(await row()).id], { block: 990 });

    expect((await confirmRequest()).status).toBe(409);
    expect(net.posted).toHaveLength(0);
  });
});

describe.each(kinds)('$kind monitor', ({ kind, monitor }) => {
  const t = kind === 'stake' ? stakes : unstakes;
  const base = { address: 'a', amount: '1', sAmount: '1', claimedAt: new Date(T0) };

  it('checks every claimed row, however many newer ones there are', async () => {
    await sql.insert(t).values({ ...base, txid: 'old', prepareTxid: 'old' });
    await sql.insert(t).values(
      Array.from({ length: 250 }, (_, i) => ({
        ...base,
        txid: `newer-${i}`,
        prepareTxid: `newer-${i}`,
        invalidatedAt: new Date(T0),
      })),
    );
    net.txs.set('old', { confirmed: true, block_height: 990 });

    await monitor(cronRequest());

    expect(await db[kind].getByTxid('old')).toMatchObject({ block: 990 });
  });

  it('eventually checks every row when lookups are slow', async () => {
    vi.useRealTimers();
    Object.assign(MONITOR_LIMITS, {
      budgetMs: 150,
      lookupTimeoutMs: 30,
      concurrency: 2,
      pageSize: 5,
    });
    try {
      // 30 never-answering lookups ahead of a confirmed row that was checked a while ago
      await sql.insert(t).values(
        Array.from({ length: 30 }, (_, i) => ({
          ...base,
          txid: `slow-${i}`,
          prepareTxid: `s${i}`,
        })),
      );
      await sql
        .insert(t)
        .values({ ...base, txid: 'target', prepareTxid: 't', lastCheckedAt: new Date(0) });
      for (let i = 0; i < 30; i++) net.slow.add(`slow-${i}`);
      net.txs.set('target', { confirmed: true, block_height: 990 });

      const started = Date.now();
      await monitor(cronRequest());
      expect(Date.now() - started).toBeLessThan(150 + 30 + 100);
      expect(await db[kind].getByTxid('target')).toMatchObject({ block: null });

      for (let run = 0; run < 10 && !(await db[kind].getByTxid('target'))?.block; run++) {
        await monitor(cronRequest());
      }
      expect(await db[kind].getByTxid('target')).toMatchObject({ block: 990 });
    } finally {
      Object.assign(MONITOR_LIMITS, {
        budgetMs: 45_000,
        lookupTimeoutMs: 10_000,
        concurrency: 8,
        pageSize: 100,
      });
    }
  }, 30_000);

  it('skips rows that were never handed to the network', async () => {
    await sql.insert(t).values({ ...base, txid: 'unclaimed', prepareTxid: 'u', claimedAt: null });
    net.txs.set('unclaimed', { confirmed: true, block_height: 990 });

    await monitor(cronRequest());

    expect(await db[kind].getByTxid('unclaimed')).toMatchObject({ block: null });
  });
});

describe.each(kinds)('$kind legacy rows (backfill)', ({ kind, prepare, confirm, monitor }) => {
  const t = kind === 'stake' ? stakes : unstakes;
  const legacy = { address: 'a', amount: '1', sAmount: '1', block: null };
  const prepareRequest = async (unsigned: string) => {
    vi.spyOn(canister, kind).mockImplementationOnce(async (psbt: string) => ({
      signed_psbt: psbt,
      debug: {},
    }));
    net.build = { psbt: unsigned, toSign: [1, 2] };
    return prepare(
      request({
        sender: { public: userPublicKey, address: userRuneAddress },
        amount: '1000',
        sAmount: '1000',
      }),
    );
  };

  it('recovers the unsigned identity of a broadcast P2SH row and never re-arms it', async () => {
    const tx = await buildTx(kind, 'p2sh');
    // Old code broadcast it, overwrote txid with the network txid and kept the PSBT
    net.txs.set('network-txid', { confirmed: false });
    await sql.insert(t).values({ ...legacy, txid: 'network-txid', psbt: tx.unsigned });

    expect(await backfillSignedPsbtState(sql)).toMatchObject({
      [kind === 'stake' ? 'stakes' : 'unstakes']: { updated: 1, superseded: 0 },
    });
    expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({
      txid: 'network-txid',
      psbt: null,
      claimedAt: expect.any(Date),
    });

    // Re-preparing the same tx finds the row, sees the tx on the network and refuses
    expect((await prepareRequest(tx.unsigned)).status).toBe(409);
    expect((await confirm(request({ psbt: tx.signed }))).status).toBe(409);
    expect(await sql.select().from(t)).toHaveLength(1);
    expect(net.posted).toHaveLength(0);
  });

  it('re-arms a legacy row whose tx never reached the network', async () => {
    const tx = await buildTx(kind, 'p2sh');
    await sql.insert(t).values({ ...legacy, txid: tx.prepareTxid, psbt: tx.unsigned });
    await backfillSignedPsbtState(sql);

    expect((await prepareRequest(tx.unsigned)).status).toBe(200);
    expect((await confirm(request({ psbt: tx.signed }))).status).toBe(200);
    expect(await sql.select().from(t)).toHaveLength(1);
    expect(net.posted).toHaveLength(1);
  });

  it('keeps one canonical row per identity, never settling a duplicate, and is idempotent', async () => {
    const tx = await buildTx(kind, 'p2wpkh');
    await sql.insert(t).values([
      { ...legacy, txid: tx.prepareTxid, psbt: tx.unsigned },
      { ...legacy, txid: tx.prepareTxid, psbt: tx.unsigned },
      { ...legacy, txid: 'no-psbt', psbt: null },
      { ...legacy, txid: 'settled', psbt: tx.unsigned, block: 900 },
    ]);

    await backfillSignedPsbtState(sql);
    const rows = await sql.select().from(t).orderBy(t.id);
    expect(rows[0]).toMatchObject({ prepareTxid: null, claimedAt: null, psbt: null });
    expect(rows[0].invalidatedAt).toBeInstanceOf(Date);
    expect(rows[1]).toMatchObject({ prepareTxid: tx.prepareTxid, psbt: null, invalidatedAt: null });
    expect(rows[1].claimedAt).toBeInstanceOf(Date);
    expect(rows[2]).toMatchObject({ prepareTxid: 'no-psbt', psbt: null });
    expect(rows[3]).toMatchObject({ prepareTxid: null, claimedAt: null, psbt: tx.unsigned });

    // Both share the network txid; only the canonical row is monitored and settles
    net.txs.set(tx.prepareTxid, { confirmed: true, block_height: 990 });
    await monitor(cronRequest());
    const settled = (await sql.select().from(t)).filter((r) => r.block === 990);
    expect(settled.map((r) => r.id)).toEqual([rows[1].id]);

    expect(await backfillSignedPsbtState(sql)).toMatchObject({
      [kind === 'stake' ? 'stakes' : 'unstakes']: { updated: 0, superseded: 0 },
    });
  });

  it.each(['older', 'newer'] as const)(
    'makes the broadcast row canonical when it is the %s duplicate',
    async (position) => {
      const tx = await buildTx(kind, 'p2sh');
      const broadcastRow = { ...legacy, txid: 'network-txid', psbt: tx.unsigned };
      const unbroadcastRow = { ...legacy, txid: tx.prepareTxid, psbt: tx.unsigned };
      await sql
        .insert(t)
        .values(
          position === 'older' ? [broadcastRow, unbroadcastRow] : [unbroadcastRow, broadcastRow],
        );
      net.txs.set('network-txid', { confirmed: false });

      await backfillSignedPsbtState(sql);
      expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({
        txid: 'network-txid',
      });

      // The tx is on the network: no second broadcast, and only one row settles
      expect((await prepareRequest(tx.unsigned)).status).toBe(409);
      expect((await confirm(request({ psbt: tx.signed }))).status).toBe(409);
      net.txs.set('network-txid', { confirmed: true, block_height: 990 });
      await monitor(cronRequest());
      expect((await sql.select().from(t)).filter((r) => r.block === 990)).toHaveLength(1);
      expect(net.posted).toHaveLength(0);
    },
  );

  it('moves a broadcast txid onto a row that already holds the identity', async () => {
    const tx = await buildTx(kind, 'p2sh');
    await sql.insert(t).values([
      { ...legacy, txid: tx.prepareTxid, prepareTxid: tx.prepareTxid, psbt: tx.unsigned },
      { ...legacy, txid: 'network-txid', psbt: tx.unsigned },
    ]);
    net.txs.set('network-txid', { confirmed: false });

    await backfillSignedPsbtState(sql);

    expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({
      txid: 'network-txid',
      psbt: null,
      claimedAt: expect.any(Date),
    });
    expect(await db[kind].getByTxid('network-txid')).toMatchObject({
      prepareTxid: tx.prepareTxid,
    });
    expect((await prepareRequest(tx.unsigned)).status).toBe(409);
  });

  it('skips and reports rows with an unreadable PSBT, leaving them untouched', async () => {
    await sql.insert(t).values({ ...legacy, txid: 'broken', psbt: 'not-a-psbt' });

    const summary = await backfillSignedPsbtState(sql);

    const [row] = await sql.select().from(t);
    expect(summary[kind === 'stake' ? 'stakes' : 'unstakes'].skipped).toEqual([row.id]);
    expect(row).toMatchObject({ psbt: 'not-a-psbt', prepareTxid: null, claimedAt: null });
  });

  it('after a rollback, reconciles rows the old code may have confirmed', async () => {
    const tx = await buildTx(kind, 'p2sh');
    // Prepared by the new build, then confirmed by the rolled-back old build: txid updated,
    // PSBT kept, no claim recorded
    const rollbackStart = new Date(Date.now() - 60_000);
    await sql.insert(t).values({
      ...legacy,
      txid: 'network-txid',
      prepareTxid: tx.prepareTxid,
      psbt: tx.unsigned,
    });
    net.txs.set('network-txid', { confirmed: false });

    // Without the rollback mode the row is not picked up
    await backfillSignedPsbtState(sql);
    expect((await db[kind].getByPrepareTxid(tx.prepareTxid))?.claimedAt).toBeNull();

    expect(await backfillSignedPsbtState(sql, { since: rollbackStart })).toMatchObject({
      [kind === 'stake' ? 'stakes' : 'unstakes']: { rollback: 1 },
    });
    expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({
      prepareTxid: tx.prepareTxid,
      psbt: null,
      claimedAt: expect.any(Date),
    });
    expect((await confirm(request({ psbt: tx.signed }))).status).toBe(409);
    expect((await prepareRequest(tx.unsigned)).status).toBe(409);
    net.txs.set('network-txid', { confirmed: true, block_height: 990 });
    await monitor(cronRequest());
    expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({ block: 990 });
    expect(net.posted).toHaveLength(0);
  });

  it('picks up rows written by old code after the migration when re-run', async () => {
    // Without a backfill, such a row is invisible to the monitor and to confirm
    await sql.insert(t).values({ ...legacy, txid: 'late', psbt: null });
    net.txs.set('late', { confirmed: true, block_height: 990 });
    await monitor(cronRequest());
    expect(await db[kind].getByTxid('late')).toMatchObject({ block: null });

    await backfillSignedPsbtState(sql);
    await monitor(cronRequest());
    expect(await db[kind].getByTxid('late')).toMatchObject({ block: 990 });
  });
});
