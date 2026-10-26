/**
 * Runs the stake/unstake confirm flow against real Postgres (PGlite, in-process) so the
 * conditional UPDATEs that guard the stored canister signature are exercised for real.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest } from 'next/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as monitorStake } from '@/app/api/cron/monitor/stake/route';
import { GET as monitorUnstake } from '@/app/api/cron/monitor/unstake/route';
import { POST as confirmStake } from '@/app/api/stake/confirm/route';
import { POST as prepareStake } from '@/app/api/stake/route';
import { POST as confirmUnstake } from '@/app/api/unstake/confirm/route';
import { POST as prepareUnstake } from '@/app/api/unstake/route';
import { config } from '@/config/config';
import { db } from '@/db';
import { sql } from '@/db/client';
import { CANISTER_CLAIM_STALE_MS, CANISTER_SIGNATURE_MAX_AGE_MS } from '@/lib/canister-signature';
import { BroadcastService } from '@/services/broadcast';

const mock = vi.hoisted(() => ({
  broadcast: vi.fn(),
  build: vi.fn(),
  getTxStatus: vi.fn(),
  tipHeight: vi.fn(),
}));

vi.mock('@/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  return { sql: drizzle(new PGlite(), { schema }), schema };
});

vi.mock('@/services/broadcast', async (importOriginal) => {
  const mod = await importOriginal<{ BroadcastService: unknown }>();
  return {
    BroadcastService: Object.assign(
      vi.fn(function BroadcastServiceMock() {
        return { broadcast: mock.broadcast };
      }),
      mod.BroadcastService,
    ),
  };
});

vi.mock('@/services/psbt', async (importOriginal) => {
  const mod = await importOriginal<{ PSBTService: unknown }>();
  return {
    PSBTService: Object.assign(
      vi.fn(function PSBTServiceMock() {
        return { build: mock.build };
      }),
      mod.PSBTService,
    ),
  };
});

vi.mock('@/providers/mempool', () => ({
  mempool: {
    transactions: { getTxStatus: mock.getTxStatus },
    blocks: { getBlocksTipHeight: mock.tipHeight },
  },
}));

vi.mock('@/providers/canister', async () => {
  const bitcoinLib = await import('bitcoinjs-lib');
  const signed = new bitcoinLib.Psbt().toBase64();
  return {
    canister: {
      network: bitcoinLib.networks.testnet,
      address: 'canister-address',
      retention: 'retention-address',
      stake: vi.fn().mockResolvedValue({ signed_psbt: signed }),
      unstake: vi.fn().mockResolvedValue({ signed_psbt: signed }),
      getUnstakeUtxos: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock('@/providers/redis', () => ({
  redis: { utxo: { free: vi.fn().mockResolvedValue(undefined) } },
}));

vi.mock('@/server/auth/session', () => ({
  requireSession: vi.fn().mockResolvedValue({ address: 'addr' }),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

const notFound = () =>
  Object.assign(new Error('Transaction not found'), {
    isAxiosError: true,
    response: { status: 404 },
  });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
const at = (offsetMs: number) => vi.setSystemTime(T0 + offsetMs);

const signedPsbt = new bitcoin.Psbt().toBase64();
const tempTxid = (
  bitcoin.Psbt.fromBase64(signedPsbt).data.globalMap.unsignedTx as unknown as {
    tx: { getId(): string };
  }
).tx.getId();

const cronRequest = () =>
  new NextRequest('http://localhost/api/cron/monitor', {
    headers: { authorization: `Bearer ${config.secrets.cron}` },
  });
const request = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;

beforeAll(async () => {
  const dir = join(process.cwd(), 'drizzle');
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    for (const statement of readFileSync(join(dir, file), 'utf8').split(
      '--> statement-breakpoint',
    )) {
      await sql.execute(statement);
    }
  }
});

describe.each([
  {
    kind: 'stake' as const,
    prepare: prepareStake,
    confirm: confirmStake,
    monitor: monitorStake,
  },
  {
    kind: 'unstake' as const,
    prepare: prepareUnstake,
    confirm: confirmUnstake,
    monitor: monitorUnstake,
  },
])('$kind confirm against Postgres', ({ kind, prepare, confirm, monitor }) => {
  const table = db[kind];
  const confirmRequest = () => confirm(request({ psbt: signedPsbt }));
  const prepareRequest = () =>
    prepare(
      request({ sender: { public: 'pub', address: 'addr' }, amount: '1000', sAmount: '900' }),
    );
  const row = async () => (await table.getByTxid(tempTxid))!;
  const ok = { txid: tempTxid, fee: '1000', feeRate: 5, psbt: signedPsbt, tx: '00' };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(0);
    await sql.execute('TRUNCATE stakes, unstakes');
    mock.broadcast.mockReset();
    mock.getTxStatus.mockReset().mockRejectedValue(notFound());
    mock.tipHeight.mockReset().mockResolvedValue(1000);
    mock.build.mockReset().mockResolvedValue({ psbt: 'unsigned', toSign: [], feeRate: 5 });
    expect((await prepareRequest()).status).toBe(200);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('broadcasts once when two confirms race', async () => {
    mock.broadcast.mockResolvedValue(ok);

    const statuses = (await Promise.all([confirmRequest(), confirmRequest()])).map((r) => r.status);

    expect(statuses.sort()).toEqual([200, 409]);
    expect(mock.broadcast).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({ psbt: null, invalidatedAt: null });
  });

  it('keeps a broadcast that is in flight when a retry crosses the deadline', async () => {
    const pending = deferred<typeof ok>();
    mock.broadcast.mockReturnValueOnce(pending.promise);
    at(CANISTER_SIGNATURE_MAX_AGE_MS - 1000);
    const first = confirmRequest();
    await vi.waitFor(() => expect(mock.broadcast).toHaveBeenCalledTimes(1));

    at(CANISTER_SIGNATURE_MAX_AGE_MS + 1000);
    expect((await confirmRequest()).status).toBe(409);

    pending.resolve(ok);
    expect((await first).status).toBe(200);
    expect(mock.broadcast).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({ txid: tempTxid, invalidatedAt: null });
  });

  it('expires an unclaimed signature after the deadline and keeps the row', async () => {
    at(CANISTER_SIGNATURE_MAX_AGE_MS + 1000);

    expect((await confirmRequest()).status).toBe(410);
    expect(mock.broadcast).not.toHaveBeenCalled();
    expect(await row()).toMatchObject({ psbt: null, invalidatedAt: expect.any(Date) });
  });

  it('treats a broadcast error as success when the tx reached the network', async () => {
    mock.broadcast.mockRejectedValue(new BroadcastService.BroadcastError('timeout'));
    mock.getTxStatus.mockResolvedValue({ confirmed: false });

    const response = await confirmRequest();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ txid: tempTxid });
    expect(await row()).toMatchObject({ invalidatedAt: null });
  });

  it('never re-arms or hides a tx that landed after its broadcast looked failed', async () => {
    // The broadcast response is lost and the tx is not visible yet: the row is invalidated
    mock.broadcast.mockRejectedValueOnce(new BroadcastService.BroadcastError('timeout'));
    expect((await confirmRequest()).status).toBe(400);
    expect(await row()).toMatchObject({ invalidatedAt: expect.any(Date) });

    // The tx shows up; a retry of the identical tx is refused and the row is restored
    mock.getTxStatus.mockResolvedValue({ confirmed: false });
    expect((await prepareRequest()).status).toBe(409);
    expect(await row()).toMatchObject({ psbt: null, invalidatedAt: null });

    // It confirms; a delayed confirm can't claim it, and the row stays live
    mock.getTxStatus.mockResolvedValue({ confirmed: true, block_height: 990 });
    await monitor(cronRequest());
    expect((await confirmRequest()).status).toBe(409);
    expect(mock.broadcast).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({ block: 990, psbt: null, invalidatedAt: null });
  });

  it('cannot reuse a refreshed signature once the tx is confirmed', async () => {
    // The tx was broadcast but the mempool lookups lag, so a retry re-arms the row
    mock.broadcast.mockRejectedValueOnce(new BroadcastService.BroadcastError('timeout'));
    expect((await confirmRequest()).status).toBe(400);
    expect((await prepareRequest()).status).toBe(200);
    expect(await row()).toMatchObject({ psbt: signedPsbt, invalidatedAt: null });

    // The monitor sees the confirmation and drops the stored signature
    mock.getTxStatus.mockResolvedValue({ confirmed: true, block_height: 990 });
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ block: 990, psbt: null, invalidatedAt: null });

    expect((await confirmRequest()).status).toBe(409);
    expect(mock.broadcast).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({ block: 990, invalidatedAt: null });
  });

  it('recovers an abandoned claim once it is stale and the tx is unknown', async () => {
    // A confirm claims the signature and dies before the broadcast outcome is recorded
    const claimedAt = await table.claimSignedPsbt(
      (await row()).id,
      signedPsbt,
      new Date(T0 - CANISTER_SIGNATURE_MAX_AGE_MS),
    );
    expect(claimedAt).not.toBeNull();

    expect((await confirmRequest()).status).toBe(409);

    at(CANISTER_CLAIM_STALE_MS + 1000);
    expect((await confirmRequest()).status).toBe(410);
    expect(await row()).toMatchObject({ invalidatedAt: expect.any(Date) });

    // Starting again re-arms the same tx with a fresh signature, which then broadcasts
    expect((await prepareRequest()).status).toBe(200);
    mock.broadcast.mockResolvedValue(ok);
    expect((await confirmRequest()).status).toBe(200);
    expect(mock.broadcast).toHaveBeenCalledTimes(1);
  });

  it('lets the user start again straight after a stale, unknown claim', async () => {
    await table.claimSignedPsbt((await row()).id, signedPsbt, new Date(0));
    at(CANISTER_CLAIM_STALE_MS + 1000);

    expect((await prepareRequest()).status).toBe(200);
    expect(await row()).toMatchObject({ psbt: signedPsbt, claimedAt: null });
    mock.broadcast.mockResolvedValue(ok);
    expect((await confirmRequest()).status).toBe(200);
    expect(mock.broadcast).toHaveBeenCalledTimes(1);
  });

  it('never broadcasts a signature stored on a confirmed row', async () => {
    // e.g. rows confirmed before this change kept their PSBT
    await table.update([(await row()).id], { block: 990 });

    expect((await confirmRequest()).status).toBe(409);
    expect(mock.broadcast).not.toHaveBeenCalled();
    expect(await row()).toMatchObject({ psbt: signedPsbt, invalidatedAt: null });
  });

  it('leaves confirmed rows alone in every signature transition', async () => {
    const { id } = await row();
    await table.update([id], { block: 990 });
    const later = new Date(T0 + 60_000);

    expect(await table.claimSignedPsbt(id, signedPsbt, new Date(0))).toBeNull();
    expect(await table.expireSignedPsbt(id, later)).toBe(false);
    await table.update([id], { invalidatedAt: new Date() });
    expect(await table.refreshSignedPsbt(id, 'fresh', later, later)).toBe(false);
    await table.update([id], { psbt: null, invalidatedAt: null, claimedAt: new Date(T0) });
    expect(await table.invalidateClaim(id, new Date(T0))).toBe(false);
    expect(await row()).toMatchObject({ block: 990, invalidatedAt: null });
  });

  it('only invalidates the claim it was given', async () => {
    const { id } = await row();
    const claimedAt = (await table.claimSignedPsbt(id, signedPsbt, new Date(0)))!;

    expect(await table.invalidateClaim(id, new Date(claimedAt.getTime() - 1))).toBe(false);
    expect(await table.invalidateClaim(id, claimedAt)).toBe(true);
    expect(await table.invalidateClaim(id, claimedAt)).toBe(false);
  });

  it('does not hand out a PSBT for a tx whose confirm is still in flight', async () => {
    await table.claimSignedPsbt((await row()).id, signedPsbt, new Date(0));

    expect((await prepareRequest()).status).toBe(409);
    expect(await row()).toMatchObject({ psbt: null, invalidatedAt: null });
  });

  it('hands out the PSBT again while the stored signature is still usable', async () => {
    expect((await prepareRequest()).status).toBe(200);
    mock.broadcast.mockResolvedValue(ok);
    expect((await confirmRequest()).status).toBe(200);
  });

  it('restores an invalidated row once the monitor sees its tx in the mempool', async () => {
    mock.broadcast.mockRejectedValueOnce(new BroadcastService.BroadcastError('timeout'));
    expect((await confirmRequest()).status).toBe(400);
    expect(await row()).toMatchObject({ invalidatedAt: expect.any(Date) });

    mock.getTxStatus.mockResolvedValue({ confirmed: false });
    await monitor(cronRequest());
    expect(await row()).toMatchObject({ invalidatedAt: null, block: null });
  });

  it('keeps an abandoned claim whose tx reached the network', async () => {
    await table.claimSignedPsbt((await row()).id, signedPsbt, new Date(0));
    at(CANISTER_CLAIM_STALE_MS + 1000);
    mock.getTxStatus.mockResolvedValue({ confirmed: false });

    expect((await confirmRequest()).status).toBe(409);
    expect((await prepareRequest()).status).toBe(409);
    expect(await row()).toMatchObject({ psbt: null, invalidatedAt: null });
    expect(mock.broadcast).not.toHaveBeenCalled();
  });
});
