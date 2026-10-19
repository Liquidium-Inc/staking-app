import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const API_KEY = 'support-api-key-for-tests';
const ADDRESS = 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c';
const VERIFIED_BY = { backend: 'wtf-btc', verifiedAt: 1, tokenId: 'jti-1' };
const TXID = 'a'.repeat(64);
const CLAIM_TX = 'c'.repeat(64);
const CREATED = new Date(Date.UTC(2026, 9, 1));

const mock = vi.hoisted(() => ({
  support: { apiKey: undefined as string | undefined, tokenSecret: 's'.repeat(32) },
  db: {
    stake: { getOwnByTxid: vi.fn(), getRecentOf: vi.fn() },
    unstake: { getOwnByTxid: vi.fn(), getRecentOf: vi.fn() },
  },
  mempool: { transactions: { getTx: vi.fn(), getTxStatus: vi.fn() } },
}));

vi.mock('@/config/config', () => ({ config: { env: 'test', support: mock.support } }));
vi.mock('@/db', () => ({ db: mock.db }));
vi.mock('@/providers/mempool', () => ({ mempool: mock.mempool }));
vi.mock('@/providers/rune-provider', () => ({
  MAX_WALLET_ACTIVITY_RESULTS: 500,
  runeProvider: {},
}));
vi.mock('@/providers/canister', () => ({ canister: {} }));
vi.mock('@/services/portfolioActivity.service', () => ({ getPortfolioActivity: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

async function item(body: Record<string, unknown>) {
  const response = await POST(
    new NextRequest('http://localhost/api/support/item', {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ address: ADDRESS, verifiedBy: VERIFIED_BY, ...body }),
    }),
  );
  return { status: response.status, body: await response.json() };
}

describe('POST /api/support/item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.support.apiKey = API_KEY;
    mock.mempool.transactions.getTx.mockResolvedValue({ status: { confirmed: false } });
    mock.mempool.transactions.getTxStatus.mockResolvedValue({ confirmed: false });
  });

  it('looks a stake up by exact txid and owner, not by searching the history', async () => {
    mock.db.stake.getOwnByTxid.mockResolvedValue({
      id: 7,
      txid: TXID,
      amount: '100',
      sAmount: '90',
      timestamp: CREATED,
      block: 900_000,
    });

    const { status, body } = await item({ kind: 'stake', id: TXID });

    expect(status).toBe(200);
    expect(body.item).toMatchObject({ kind: 'stake', txid: TXID, state: 'confirmed' });
    expect(mock.db.stake.getOwnByTxid).toHaveBeenCalledWith(ADDRESS, TXID);
    expect(mock.db.stake.getRecentOf).not.toHaveBeenCalled();
    // A settled stake needs no chain lookup.
    expect(mock.mempool.transactions.getTx).not.toHaveBeenCalled();
  });

  it('finds an unstake by its claim txid', async () => {
    mock.db.unstake.getOwnByTxid.mockResolvedValue({
      id: 8,
      address: ADDRESS,
      txid: TXID,
      amount: '100',
      sAmount: '90',
      timestamp: CREATED,
      block: 900_000,
      claimTx: CLAIM_TX,
      claimTxBlock: null,
    });

    const { status, body } = await item({ kind: 'unstake', id: CLAIM_TX });

    expect(status).toBe(200);
    expect(body.item).toMatchObject({
      kind: 'unstake',
      txid: TXID,
      state: 'claim_submitted',
      claimTx: CLAIM_TX,
      claimStatus: 'pending',
    });
    expect(mock.db.unstake.getOwnByTxid).toHaveBeenCalledWith(ADDRESS, CLAIM_TX);
    expect(mock.db.unstake.getRecentOf).not.toHaveBeenCalled();
  });

  it("is 404 when the txid isn't one of the address's records", async () => {
    mock.db.stake.getOwnByTxid.mockResolvedValue(undefined);

    expect(await item({ kind: 'stake', id: TXID })).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
  });
});
