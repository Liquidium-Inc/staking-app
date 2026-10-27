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
import { POST as confirmWithdraw } from '@/app/api/withdraw/confirm/route';
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
  lookups: [] as string[],
  // The node refuses the next broadcast with this message (HTTP 400)
  reject: undefined as string | undefined,
  tipHangs: false,
  // txid -> mempool getTx payload, for withdrawals
  fullTxs: new Map<string, unknown>(),
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
      blocks: {
        getBlocksTipHeight: async () => {
          if (net.tipHangs) await new Promise(() => {});
          return 1000;
        },
      },
      transactions: {
        getTxStatus: async ({ txid }: { txid: string }) => {
          net.lookups.push(txid);
          if (net.lookupFails) throw axiosError(502, 'bad gateway');
          if (net.slow.has(txid)) await new Promise(() => {});
          const status = net.txs.get(txid);
          if (!status || (net.lagging && !status.confirmed)) {
            throw axiosError(404, 'Transaction not found');
          }
          return status;
        },
        getTx: async ({ txid }: { txid: string }) => net.fullTxs.get(txid),
        postTx: async ({ txhex }: { txhex: string }) => {
          await net.hold;
          const txid = lib.Transaction.fromHex(txhex).getId();
          if (net.reject) throw axiosError(400, net.reject);
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
  net.lookups = [];
  net.slow.clear();
  net.fullTxs.clear();
  net.tipHangs = false;
  net.reject = undefined;
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

  it('keeps a send whose response was lost on a lagging network: one record, one broadcast', async () => {
    // Sent and accepted, but the response is lost and lookups lag: the attempt is kept
    net.loseResponse = true;
    net.lagging = true;
    expect((await confirmRequest()).status).toBe(400);
    const networkTxid = net.posted[0];
    expect(await row()).toMatchObject({
      txid: networkTxid,
      broadcastAt: expect.any(Date),
      invalidatedAt: null,
    });

    // Never released or re-armed on 404s alone, even once the claim is stale
    net.loseResponse = false;
    at(CANISTER_CLAIM_STALE_MS + 1000);
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ invalidatedAt: null });
    expect((await prepareRequest()).status).toBe(409);
    expect((await confirmRequest()).status).toBe(409);
    expect(await rowCount()).toBe(1);

    // The tx shows up and confirms
    net.lagging = false;
    confirmOnChain(networkTxid);
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ block: 990, txid: networkTxid });
    expect(net.posted).toHaveLength(1);
  });

  it('retires a stored signature as soon as the tx is seen on the network', async () => {
    // e.g. a row re-armed while lookups lagged: the network has the tx, the row still a PSBT
    const { id } = await row();
    await table.update([id], { claimedAt: new Date(T0) });
    net.txs.set(tx.prepareTxid, { confirmed: false });

    await monitor(cronRequest());

    expect(await row()).toMatchObject({ psbt: null, invalidatedAt: null, block: null });
    expect((await confirmRequest()).status).toBe(409);
    expect(net.posted).toHaveLength(0);
  });

  it('never gives up an attempted send, but checks it only daily after 30 days unseen', async () => {
    net.loseResponse = true;
    net.lagging = true;
    expect((await confirmRequest()).status).toBe(400);
    net.loseResponse = false;
    const lookups = () => net.lookups.filter((txid) => txid === net.posted[0]).length;

    at(31 * 24 * 60 * 60 * 1000);
    await monitor(cronRequest());
    const afterFirst = lookups();
    expect(afterFirst).toBeGreaterThan(0);
    // Same day: skipped
    at(31 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000);
    await monitor(cronRequest());
    expect(lookups()).toBe(afterFirst);
    expect(await row()).toMatchObject({ invalidatedAt: null, block: null });

    // A day later it is checked again; it confirmed after all and settles
    at(32 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000);
    net.lagging = false;
    confirmOnChain(net.posted[0]);
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ block: 990, invalidatedAt: null });
    expect(net.posted).toHaveLength(1);
    // Still listed for the user (the unstake's withdrawal card), found by its network txid
    if (kind === 'unstake') {
      expect((await db.unstake.getPendingsOf(userRuneAddress)).map((p) => p.txid)).toContain(
        net.posted[0],
      );
    }
    expect(await table.getByTxid(net.posted[0])).toMatchObject({ id: (await row()).id });
  });

  it('sends nothing and releases the claim when the send attempt cannot be recorded', async () => {
    vi.spyOn(table, 'recordBroadcastTxid').mockRejectedValueOnce(new Error('db down'));

    expect((await confirmRequest()).status).toBe(500);

    expect(net.posted).toHaveLength(0);
    expect(await row()).toMatchObject({ broadcastAt: null, invalidatedAt: expect.any(Date) });
    expect((await prepareRequest()).status).toBe(200);
  });

  it('keeps the attempt even when the node answers with an error', async () => {
    // mempool.space also wraps transport and conflict errors in 400s, so no refusal is proof
    net.reject = 'min relay fee not met, 100 < 200';
    expect((await confirmRequest()).status).toBe(400);
    expect(await row()).toMatchObject({ broadcastAt: expect.any(Date), invalidatedAt: null });
    net.reject = undefined;
    expect((await prepareRequest()).status).toBe(409);
    expect(net.posted).toHaveLength(0);
  });

  it('still releases a stale claim that never reached the send step', async () => {
    // Crash after claiming, before the send attempt was recorded
    await table.claimSignedPsbt((await row()).id, tx.unsigned, new Date(0));
    at(CANISTER_CLAIM_STALE_MS + 1000);

    await monitor(cronRequest());

    expect(await row()).toMatchObject({ broadcastAt: null, invalidatedAt: expect.any(Date) });
    expect((await prepareRequest()).status).toBe(200);
  });

  it('never releases or re-arms an accepted broadcast on a later 404, even past a week', async () => {
    expect((await confirmRequest()).status).toBe(200);
    expect((await row()).broadcastAt).toBeInstanceOf(Date);

    // The mempool API loses track of the tx
    net.lagging = true;
    at(CANISTER_CLAIM_STALE_MS + 1000);
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ invalidatedAt: null });
    expect((await confirmRequest()).status).toBe(409);
    expect((await prepareRequest()).status).toBe(409);

    at(8 * 24 * 60 * 60 * 1000);
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ invalidatedAt: null, block: null });

    // The lookup recovers: it settles, and it was only ever broadcast once
    net.lagging = false;
    confirmOnChain(net.posted[0]);
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ block: 990, invalidatedAt: null });
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
    const originalLimits = { ...MONITOR_LIMITS };
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
      await monitor(cronRequest());
      expect(await db[kind].getByTxid('target')).toMatchObject({ block: null });

      for (let run = 0; run < 10 && !(await db[kind].getByTxid('target'))?.block; run++) {
        await monitor(cronRequest());
      }
      expect(await db[kind].getByTxid('target')).toMatchObject({ block: 990 });
    } finally {
      Object.assign(MONITOR_LIMITS, originalLimits);
    }
  }, 30_000);

  it('keeps checking valid claims past a week but stops polling old invalidated ones', async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await sql.insert(t).values([
      { ...base, txid: 'old-valid', prepareTxid: 'ov', timestamp: old },
      { ...base, txid: 'old-invalid', prepareTxid: 'oi', timestamp: old, invalidatedAt: old },
    ]);
    net.txs.set('old-valid', { confirmed: true, block_height: 990 });
    net.txs.set('old-invalid', { confirmed: true, block_height: 990 });

    await monitor(cronRequest());

    expect(await db[kind].getByTxid('old-valid')).toMatchObject({ block: 990 });
    expect(await db[kind].getByTxid('old-invalid')).toMatchObject({ block: null });
  });

  it('releases a stale claim whose tx the network does not know, and restores it if it shows up', async () => {
    await sql.insert(t).values({ ...base, txid: 'ghost', prepareTxid: 'g' });

    // Claim is recent: left alone
    at(0);
    await sql.update(t).set({ claimedAt: new Date(T0) });
    await monitor(cronRequest());
    expect(await db[kind].getByTxid('ghost')).toMatchObject({ invalidatedAt: null });

    at(CANISTER_CLAIM_STALE_MS + 1000);
    await monitor(cronRequest());
    expect(await db[kind].getByTxid('ghost')).toMatchObject({ invalidatedAt: expect.any(Date) });

    net.txs.set('ghost', { confirmed: true, block_height: 990 });
    await monitor(cronRequest());
    expect(await db[kind].getByTxid('ghost')).toMatchObject({ invalidatedAt: null, block: 990 });
  });

  it('gives up quickly when the tip lookup hangs', async () => {
    vi.useRealTimers();
    const originalLimits = { ...MONITOR_LIMITS };
    Object.assign(MONITOR_LIMITS, { lookupTimeoutMs: 30 });
    net.tipHangs = true;
    try {
      const started = Date.now();
      await expect(monitor(cronRequest())).rejects.toThrow('timed out');
      expect(Date.now() - started).toBeLessThan(1000);
    } finally {
      Object.assign(MONITOR_LIMITS, originalLimits);
    }
  });

  it('settles rows at their own blocks in one pass', async () => {
    await sql.insert(t).values([
      { ...base, txid: 'at-980', prepareTxid: 'a' },
      { ...base, txid: 'at-985', prepareTxid: 'b' },
    ]);
    net.txs.set('at-980', { confirmed: true, block_height: 980 });
    net.txs.set('at-985', { confirmed: true, block_height: 985 });

    await monitor(cronRequest());

    expect(await db[kind].getByTxid('at-980')).toMatchObject({ block: 980 });
    expect(await db[kind].getByTxid('at-985')).toMatchObject({ block: 985 });
  });

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

  it('keeps a legacy P2WPKH row uncertain: never released on a 404, never re-armed', async () => {
    // Nothing proves whether old code sent it (txid equals the unsigned txid)
    const tx = await buildTx(kind, 'p2wpkh');
    await sql.insert(t).values({ ...legacy, txid: tx.prepareTxid, psbt: tx.unsigned });
    await backfillSignedPsbtState(sql);
    expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({
      broadcastAt: expect.any(Date),
      psbt: null,
    });

    await monitor(cronRequest());
    expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({ invalidatedAt: null });
    expect((await prepareRequest(tx.unsigned)).status).toBe(409);
    expect((await confirm(request({ psbt: tx.signed }))).status).toBe(409);
    expect(net.posted).toHaveLength(0);

    // If it was sent after all, it settles
    net.txs.set(tx.prepareTxid, { confirmed: true, block_height: 990 });
    await monitor(cronRequest());
    expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({ block: 990 });
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

  it('moves a withdrawal carried by a superseded duplicate onto the canonical row', async () => {
    if (kind !== 'unstake') return;
    const tx = await buildTx(kind, 'p2wpkh');
    await sql.insert(unstakes).values([
      { ...legacy, address: 'u', txid: tx.prepareTxid, psbt: tx.unsigned, claimTx: 'claim-1' },
      { ...legacy, address: 'u', txid: tx.prepareTxid, psbt: tx.unsigned },
    ]);

    await backfillSignedPsbtState(sql);

    const canonical = await db.unstake.getByPrepareTxid(tx.prepareTxid);
    expect(canonical).toMatchObject({ claimTx: 'claim-1' });
    const withdrawals = await db.unstake.getWithdrawAfterBlockForAddress(0, 'u');
    expect(withdrawals.map((w) => w.id)).toEqual([canonical!.id]);
    expect((await db.unstake.getWithdrawAfterBlock(0)).map((w) => w.id)).toEqual([canonical!.id]);
  });

  it('merges a missing claimTxBlock and skips groups with different claimTx values', async () => {
    if (kind !== 'unstake') return;
    const merged = await buildTx(kind, 'p2wpkh');
    const conflicted = await buildTx(kind, 'p2sh');
    await sql.insert(unstakes).values([
      { ...legacy, txid: merged.prepareTxid, psbt: merged.unsigned, claimTx: 'c', claimTxBlock: 7 },
      { ...legacy, txid: merged.prepareTxid, psbt: merged.unsigned, claimTx: 'c' },
      { ...legacy, txid: conflicted.prepareTxid, psbt: conflicted.unsigned, claimTx: 'x' },
      { ...legacy, txid: conflicted.prepareTxid, psbt: conflicted.unsigned, claimTx: 'y' },
    ]);

    const summary = await backfillSignedPsbtState(sql);

    expect(await db.unstake.getByPrepareTxid(merged.prepareTxid)).toMatchObject({
      claimTx: 'c',
      claimTxBlock: 7,
    });
    const conflictRows = (await sql.select().from(unstakes)).filter(
      (r) => r.txid === conflicted.prepareTxid,
    );
    expect(summary.unstakes.skipped.sort()).toEqual(conflictRows.map((r) => r.id).sort());
    expect(conflictRows.every((r) => r.psbt && !r.prepareTxid && !r.supersededAt)).toBe(true);
  });

  it('skips a group whose rows carry different network txids, for manual repair', async () => {
    const tx = await buildTx(kind, 'p2sh');
    await sql.insert(t).values([
      { ...legacy, txid: 'network-a', psbt: tx.unsigned },
      { ...legacy, txid: 'network-b', psbt: tx.unsigned },
    ]);

    const summary = await backfillSignedPsbtState(sql);

    const rows = await sql.select().from(t).orderBy(t.id);
    expect(summary[kind === 'stake' ? 'stakes' : 'unstakes'].skipped.sort()).toEqual(
      rows.map((r) => r.id).sort(),
    );
    expect(rows.every((r) => r.psbt === tx.unsigned && !r.prepareTxid && !r.claimedAt)).toBe(true);
  });

  it('lets an invalidated identity holder take over a broadcast txid', async () => {
    const tx = await buildTx(kind, 'p2sh');
    await sql.insert(t).values([
      {
        ...legacy,
        txid: tx.prepareTxid,
        prepareTxid: tx.prepareTxid,
        claimedAt: new Date(T0),
        invalidatedAt: new Date(T0),
      },
      { ...legacy, txid: 'network-txid', psbt: tx.unsigned },
    ]);

    await backfillSignedPsbtState(sql);

    expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({
      txid: 'network-txid',
      invalidatedAt: null,
    });
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

    // A normal run refuses: only the old build leaves this state
    await expect(backfillSignedPsbtState(sql)).rejects.toThrow('--since');
    expect((await db[kind].getByPrepareTxid(tx.prepareTxid))?.claimedAt).toBeNull();

    expect(await backfillSignedPsbtState(sql, { since: rollbackStart })).toMatchObject({
      [kind === 'stake' ? 'stakes' : 'unstakes']: { rollback: 1 },
    });
    expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({
      prepareTxid: tx.prepareTxid,
      psbt: null,
      claimedAt: expect.any(Date),
      broadcastAt: rollbackStart,
    });
    // A false 404 doesn't release it
    net.lagging = true;
    await monitor(cronRequest());
    expect(await db[kind].getByPrepareTxid(tx.prepareTxid)).toMatchObject({ invalidatedAt: null });
    net.lagging = false;
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

describe('withdraw confirm with a superseded duplicate', () => {
  const retentionScript = bitcoin.address.toOutputScript(canister.retention, network);
  const payerScript = p2wpkhPayer.output!;
  const unstakeTxid = 'ab'.repeat(32);

  async function withdrawRequest() {
    const psbt = new bitcoin.Psbt({ network });
    psbt.addInput({
      hash: Buffer.from(unstakeTxid, 'hex').reverse(),
      index: 1,
      witnessUtxo: { script: retentionScript, value: 10_000n },
    });
    psbt.addInput({
      hash: 'cd'.repeat(32),
      index: 0,
      witnessUtxo: { script: payerScript, value: 20_000n },
    });
    psbt.addOutput({ address: userRuneAddress, value: 29_000n });
    psbt.signInput(1, user);
    return request({ sender: 'session', psbt: psbt.toBase64() });
  }

  it.each(['first', 'last'] as const)(
    'records the claim on the canonical row when the duplicate is inserted %s',
    async (order) => {
      const canonical = {
        address: 'session',
        amount: '1',
        sAmount: '1',
        txid: unstakeTxid,
        prepareTxid: 'prep',
        claimedAt: new Date(T0),
        block: 990,
      };
      const duplicate = {
        address: 'session',
        amount: '1',
        sAmount: '1',
        txid: unstakeTxid,
        invalidatedAt: new Date(T0),
        supersededAt: new Date(T0),
      };
      await sql
        .insert(unstakes)
        .values(order === 'first' ? [duplicate, canonical] : [canonical, duplicate]);
      net.fullTxs.set(unstakeTxid, {
        txid: unstakeTxid,
        vout: [{ scriptpubkey_address: 'session' }, { scriptpubkey_address: canister.retention }],
        status: { confirmed: true, block_time: 1_000 },
      });

      const response = await confirmWithdraw(await withdrawRequest());

      expect(response.status).toBe(200);
      const rows = await sql.select().from(unstakes).orderBy(unstakes.id);
      const byPrepare = rows.find((r) => r.prepareTxid === 'prep')!;
      const superseded = rows.find((r) => r.supersededAt)!;
      expect(byPrepare.claimTx).toBe(net.posted[0]);
      expect(superseded.claimTx).toBeNull();
    },
  );
});
