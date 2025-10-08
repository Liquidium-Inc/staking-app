import { NextRequest } from 'next/server';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { config } from '@/config/config';
import { config as publicConfig } from '@/config/public';

import { GET } from './route';

const mock = vi.hoisted(() => ({
  canister: {
    address: 'mock-address',
    getExchangeRate: vi.fn(),
    pushExchangeRate: vi.fn(),
  },
  mempool: {
    blocks: {
      getBlocksTipHeight: vi.fn(),
    },
  },
  db: {
    poolBalance: {
      insert: vi.fn(),
    },
  },
}));

vi.mock('@/providers/canister', () => ({ canister: mock.canister }));
vi.mock('@/providers/mempool', () => ({ mempool: mock.mempool }));
vi.mock('@/db', () => ({ db: { poolBalance: { insert: mock.db.poolBalance.insert } } }));

function createRequest(token: string | undefined) {
  const request = new NextRequest('http://localhost/api/cron/exchange_rate_pusher');
  if (token) request.headers.set('authorization', `Bearer ${token}`);
  return request;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET', () => {
  it('returns 401 if authorization header is missing', async () => {
    const req = createRequest(undefined);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 if authorization header is invalid', async () => {
    const req = createRequest('wrong-secret');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('gets exchange rate from canister, updates db, and returns success', async () => {
    const mockExchangeRate = {
      circulating: 1000n,
      balance: 500n,
    };
    const mockBlockHeight = 123;

    mock.canister.getExchangeRate.mockResolvedValueOnce(mockExchangeRate);
    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValueOnce(mockBlockHeight);

    const res = await GET(createRequest(config.secrets.cron));

    expect(mock.canister.getExchangeRate).toHaveBeenCalled();
    expect(mock.mempool.blocks.getBlocksTipHeight).toHaveBeenCalled();
    // NOTE: No longer pushing to canister as it handles rates internally
    expect(mock.canister.pushExchangeRate).not.toHaveBeenCalled();

    // stakedBalance = supply - circulating
    const expectedStakedBalance = (
      BigInt(publicConfig.sRune.supply) - mockExchangeRate.circulating
    ).toString();
    expect(mock.db.poolBalance.insert).toHaveBeenCalledWith(
      expectedStakedBalance,
      mockExchangeRate.balance.toString(),
      mockBlockHeight,
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true });
  });

  it('handles errors from canister', async () => {
    mock.canister.getExchangeRate.mockRejectedValueOnce(new Error('Failed to get exchange rate'));

    const req = createRequest(config.secrets.cron);
    await expect(GET(req)).rejects.toThrow('Failed to get exchange rate');

    expect(mock.canister.pushExchangeRate).not.toHaveBeenCalled();
    expect(mock.db.poolBalance.insert).not.toHaveBeenCalled();
  });

  it('handles mempool API errors', async () => {
    const mockExchangeRate = {
      circulating: 1000n,
      balance: 500n,
    };

    mock.canister.getExchangeRate.mockResolvedValueOnce(mockExchangeRate);
    mock.mempool.blocks.getBlocksTipHeight.mockRejectedValueOnce(new Error('Mempool API Error'));

    const req = createRequest(config.secrets.cron);
    await expect(GET(req)).rejects.toThrow('Mempool API Error');

    expect(mock.canister.getExchangeRate).toHaveBeenCalled();
    expect(mock.db.poolBalance.insert).not.toHaveBeenCalled();
  });
});
