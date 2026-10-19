import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const API_KEY = 'support-api-key-for-tests';
const ADDRESS = 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c';
const VERIFIED_BY = { backend: 'wtf-btc', verifiedAt: 1, tokenId: 'jti-1' };
const BASE_MS = Date.UTC(2026, 9, 1);
const MINUTE_MS = 60_000;

const mock = vi.hoisted(() => ({
  support: { apiKey: undefined as string | undefined, tokenSecret: 's'.repeat(32) },
  db: { stake: { getRecentOf: vi.fn() }, unstake: { getRecentOf: vi.fn() } },
  mempool: { transactions: { getTx: vi.fn(), getTxStatus: vi.fn() } },
  getPortfolioActivity: vi.fn(),
}));

vi.mock('@/config/config', () => ({ config: { env: 'test', support: mock.support } }));
vi.mock('@/db', () => ({ db: mock.db }));
vi.mock('@/providers/mempool', () => ({ mempool: mock.mempool }));
vi.mock('@/providers/rune-provider', () => ({
  MAX_WALLET_ACTIVITY_RESULTS: 500,
  runeProvider: {},
}));
vi.mock('@/providers/canister', () => ({ canister: {} }));
vi.mock('@/services/portfolioActivity.service', () => ({
  getPortfolioActivity: mock.getPortfolioActivity,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/support/list', {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ address: ADDRESS, verifiedBy: VERIFIED_BY, ...body }),
  });
}

async function list(body: Record<string, unknown>) {
  const response = await POST(request(body));
  return { status: response.status, body: await response.json() };
}

// Newest first by id, one minute apart; ids 1..count.
function stakeRows(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const id = count - index;
    return {
      id,
      txid: `${id}`.padStart(64, '0'),
      amount: '100',
      sAmount: '90',
      timestamp: new Date(BASE_MS + id * MINUTE_MS),
      block: (900_000 + id) as number | null,
    };
  });
}

describe('POST /api/support/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.support.apiKey = API_KEY;
    mock.db.stake.getRecentOf.mockResolvedValue(stakeRows(45));
    mock.db.unstake.getRecentOf.mockResolvedValue([]);
    mock.mempool.transactions.getTx.mockResolvedValue({ status: { confirmed: false } });
    mock.mempool.transactions.getTxStatus.mockResolvedValue({
      confirmed: true,
      block_time: BASE_MS / 1000,
      block_height: 900_000,
    });
    mock.getPortfolioActivity.mockResolvedValue({ activity: [], complete: true });
  });

  it('rejects an unknown kind with bad_kind', async () => {
    expect(await list({ kind: 'loans' })).toEqual({ status: 400, body: { error: 'bad_kind' } });
  });

  it.each([
    ['an unknown key', 'stakes', { collection: 'x' }],
    ['an unknown state', 'stakes', { state: 'ACTIVE' }],
    ['a state on activity', 'activity', { state: 'pending' }],
    ['a non-ISO date', 'unstakes', { from: 'Oct 1 2026' }],
    ['an empty state list', 'stakes', { state: [] }],
  ])('rejects %s with bad_filter', async (_label, kind, filter) => {
    expect(await list({ kind, filter })).toEqual({ status: 400, body: { error: 'bad_filter' } });
    expect(mock.db.stake.getRecentOf).not.toHaveBeenCalled();
  });

  it('rejects a cursor it did not issue', async () => {
    const { status, body } = await list({ kind: 'stakes', cursor: 'not-a-cursor' });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'bad_request' });
  });

  it('pages newest first with an exact total and stable cursors', async () => {
    const first = await list({ kind: 'stakes' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ total: 45, totalExact: true, values: [] });
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0]).toEqual({
      txid: '45'.padStart(64, '0'),
      state: 'confirmed',
      amount: '1',
      sAmount: '0.9',
      ts: BASE_MS + 45 * MINUTE_MS,
      confirmed: true,
      feeRate: null,
    });

    // A new stake arriving between pages must not shift the next page.
    mock.db.stake.getRecentOf.mockResolvedValue(stakeRows(46));
    const second = await list({ kind: 'stakes', cursor: first.body.nextCursor });
    const third = await list({ kind: 'stakes', cursor: second.body.nextCursor, limit: 20 });

    const ids = [...first.body.items, ...second.body.items, ...third.body.items].map(
      (item: { txid: string }) => Number(item.txid),
    );
    expect(ids).toEqual(Array.from({ length: 45 }, (_, index) => 45 - index));
    expect(third.body.nextCursor).toBeUndefined();
  });

  it('caps the page size at 50', async () => {
    mock.db.stake.getRecentOf.mockResolvedValue(stakeRows(60));
    const { body } = await list({ kind: 'stakes', limit: 500 });
    expect(body.items).toHaveLength(50);
    expect(body.total).toBe(60);
    expect(body.nextCursor).toEqual(expect.any(String));
  });

  it('filters by state, inclusive date range and txid', async () => {
    const rows = stakeRows(5);
    rows[0] = { ...rows[0], block: null };
    mock.db.stake.getRecentOf.mockResolvedValue(rows);

    const pending = await list({ kind: 'stakes', filter: { state: ['pending'] } });
    expect(pending.body).toMatchObject({ total: 1, totalExact: true });
    expect(pending.body.items[0]).toMatchObject({ txid: rows[0].txid, state: 'pending' });

    const ranged = await list({
      kind: 'stakes',
      filter: {
        from: new Date(BASE_MS + 2 * MINUTE_MS).toISOString(),
        to: new Date(BASE_MS + 4 * MINUTE_MS).toISOString(),
      },
    });
    expect(ranged.body.total).toBe(3);

    const wholeDay = await list({
      kind: 'stakes',
      filter: { from: '2026-10-01', to: '2026-10-01' },
    });
    expect(wholeDay.body.total).toBe(5);

    const byTxid = await list({ kind: 'stakes', filter: { q: rows[2].txid } });
    expect(byTxid.body.items.map((item: { txid: string }) => item.txid)).toEqual([rows[2].txid]);
  });

  it('reports a state-filtered total as not exact when a chain lookup failed', async () => {
    const rows = stakeRows(3);
    rows[0] = { ...rows[0], block: null };
    mock.db.stake.getRecentOf.mockResolvedValue(rows);
    mock.mempool.transactions.getTx.mockRejectedValue(new Error('mempool down'));

    const filtered = await list({ kind: 'stakes', filter: { state: 'pending' } });
    const unfiltered = await list({ kind: 'stakes' });

    expect(filtered.body).toMatchObject({ total: 1, totalExact: false });
    expect(unfiltered.body).toMatchObject({ total: 3, totalExact: true });
  });

  it('finds an unstake by its claim txid', async () => {
    const claimTx = 'c'.repeat(64);
    mock.db.unstake.getRecentOf.mockResolvedValue([
      { ...stakeRows(1)[0], address: ADDRESS, claimTx, claimTxBlock: null },
      { ...stakeRows(2)[1], address: ADDRESS, claimTx: null, claimTxBlock: null },
    ]);

    const { body } = await list({
      kind: 'unstakes',
      filter: { q: claimTx, state: 'claim_submitted' },
    });

    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      state: 'claim_submitted',
      claimTx,
      claimStatus: 'confirmed',
    });
  });

  it('lists rune activity and says when the provider could not read it all', async () => {
    const txid = 'e'.repeat(64);
    mock.getPortfolioActivity.mockImplementation(async (_address: string, runeId: string) => ({
      activity: [
        {
          event_type: 'output',
          outpoint: `${txid}:0`,
          amount: '100',
          timestamp: '2026-10-02T00:00:00.000Z',
          rune_id: runeId,
          decimals: 0,
        },
      ],
      complete: false,
    }));

    const { body } = await list({ kind: 'activity', filter: { q: txid } });

    expect(body.total).toBe(2);
    expect(body.totalExact).toBe(false);
    expect(body.items[0]).toEqual(
      expect.objectContaining({ direction: 'in', amount: '100', ts: '2026-10-02T00:00:00.000Z' }),
    );
  });

  it('checks only the page on chain unless a state filter needs every row', async () => {
    const rows = stakeRows(45).map((row) => ({ ...row, block: null }));
    mock.db.stake.getRecentOf.mockResolvedValue(rows);

    const unfiltered = await list({ kind: 'stakes' });
    expect(unfiltered.body).toMatchObject({ total: 45, totalExact: true });
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledTimes(20);

    mock.mempool.transactions.getTx.mockClear();
    const filtered = await list({ kind: 'stakes', filter: { state: 'pending' } });
    expect(filtered.body).toMatchObject({ total: 45, totalExact: true });
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledTimes(45);
  });

  it('filters a chain-confirmed unstake as confirmed, not pending', async () => {
    mock.db.unstake.getRecentOf.mockResolvedValue([
      { ...stakeRows(1)[0], block: null, address: ADDRESS, claimTx: null, claimTxBlock: null },
    ]);

    const pending = await list({ kind: 'unstakes', filter: { state: 'pending' } });
    const confirmed = await list({ kind: 'unstakes', filter: { state: 'confirmed' } });

    expect(pending.body).toMatchObject({ total: 0, totalExact: true });
    expect(confirmed.body).toMatchObject({ total: 1, totalExact: true });
    expect(confirmed.body.items[0]).toMatchObject({ state: 'confirmed', confirmedAt: BASE_MS });
  });
});
