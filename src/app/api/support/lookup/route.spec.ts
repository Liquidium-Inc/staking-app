import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const API_KEY = 'support-api-key-for-tests';
const ADDRESS = 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c';
const TXID = 'd'.repeat(64);

const mock = vi.hoisted(() => ({
  support: { apiKey: undefined as string | undefined },
  db: {
    stake: { getRecentOf: vi.fn(), getByTxid: vi.fn() },
    unstake: { getRecentOf: vi.fn(), getByTxid: vi.fn(), getByClaimTx: vi.fn() },
  },
  mempool: {
    transactions: { getTxStatus: vi.fn() },
    blocks: { getBlocksTipHeight: vi.fn() },
  },
}));

vi.mock('@/config/config', () => ({ config: { env: 'test', support: mock.support } }));
vi.mock('@/db', () => ({ db: mock.db }));
vi.mock('@/providers/mempool', () => ({ mempool: mock.mempool }));
vi.mock('@/providers/rune-provider', () => ({ runeProvider: {} }));
vi.mock('@/providers/canister', () => ({ canister: {} }));

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/support/lookup', {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/support/lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.support.apiKey = API_KEY;
    mock.db.stake.getRecentOf.mockResolvedValue([]);
    mock.db.unstake.getRecentOf.mockResolvedValue([]);
    mock.db.stake.getByTxid.mockResolvedValue(undefined);
    mock.db.unstake.getByTxid.mockResolvedValue(undefined);
    mock.db.unstake.getByClaimTx.mockResolvedValue(undefined);
  });

  it('returns routing only for an address with activity', async () => {
    mock.db.stake.getRecentOf.mockResolvedValue([
      { txid: TXID, amount: '1', sAmount: '1', timestamp: new Date(), block: 1 },
    ]);

    const body = await (await POST(request({ address: ADDRESS }))).json();

    expect(Object.keys(body).sort()).toEqual(['connectHint', 'deepLink', 'hasActivity']);
    expect(body.hasActivity).toBe(true);
  });

  it('returns hasActivity false for an unknown address', async () => {
    expect(await (await POST(request({ address: ADDRESS }))).json()).toEqual({
      hasActivity: false,
    });
  });

  it('returns status without amounts or addresses for a stake txid', async () => {
    mock.db.stake.getByTxid.mockResolvedValue({
      txid: TXID,
      address: ADDRESS,
      amount: '999',
      sAmount: '888',
      block: null,
      psbt: 'secret',
    });
    mock.mempool.transactions.getTxStatus.mockResolvedValue({ confirmed: false });
    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValue(100);

    const body = await (await POST(request({ txid: TXID }))).json();

    expect(body).toEqual({
      found: true,
      operation: 'stake',
      status: 'confirming',
      confirmations: 0,
      requiredConfirmations: expect.any(Number),
      deepLink: expect.stringContaining('/portfolio'),
    });
    expect(JSON.stringify(body)).not.toMatch(/999|888|secret|tb1p/);
  });

  it('reports claims by claim txid and unknown txids as not found', async () => {
    mock.db.unstake.getByClaimTx.mockResolvedValueOnce({ claimTxBlock: 5, address: ADDRESS });

    expect(await (await POST(request({ txid: TXID }))).json()).toMatchObject({
      found: true,
      operation: 'claim',
      status: 'completed',
    });
    expect(await (await POST(request({ txid: TXID }))).json()).toEqual({ found: false });
  });

  it('rejects a body with both or neither identifier', async () => {
    expect((await POST(request({ address: ADDRESS, txid: TXID }))).status).toBe(400);
    expect((await POST(request({}))).status).toBe(400);
  });
});
