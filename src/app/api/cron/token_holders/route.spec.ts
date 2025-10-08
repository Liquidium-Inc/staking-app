import { NextRequest } from 'next/server';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { config } from '@/config/config';

import { GET } from './route';

const mock = vi.hoisted(() => ({
  BIS: { runes: { holders: vi.fn() } },
  db: { insert: vi.fn() },
}));
vi.mock('@/providers/bestinslot', () => ({ BIS: mock.BIS }));
vi.mock('@/db', () => ({
  sql: { insert: () => ({ values: mock.db.insert }) },
  schema: { tokenBalance: 'tokenBalance' },
}));

function createRequest(token: string | undefined) {
  const request = new NextRequest('http://localhost/api/cron/monitor/stake');
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

  it('fetches holders, inserts them, and returns success', async () => {
    mock.BIS.runes.holders.mockResolvedValueOnce({
      data: [
        { wallet_addr: 'addr1', total_balance: 100n },
        { wallet_addr: 'addr2', total_balance: 200n },
      ],
      block_height: 123,
    });

    const res = await GET(createRequest(config.secrets.cron));
    expect(mock.BIS.runes.holders).toHaveBeenCalledTimes(1);
    expect(mock.db.insert).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({ success: true });
  });

  it('handles multiple pages of holders', async () => {
    mock.BIS.runes.holders
      .mockResolvedValueOnce({
        data: [...Array(5000)].map(() => ({ wallet_addr: 'addr', total_balance: 1n })),
        block_height: 456,
      })
      .mockResolvedValueOnce({
        data: [{ wallet_addr: 'addr-last', total_balance: 2n }],
        block_height: 456,
      });

    await GET(createRequest(config.secrets.cron));
    expect(mock.BIS.runes.holders).toHaveBeenCalledTimes(2);
    expect(mock.db.insert).toHaveBeenCalledTimes(2);
  });
});
