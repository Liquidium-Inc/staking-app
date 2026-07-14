import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  redisClient: null as null | {
    eval: ReturnType<typeof vi.fn>;
  },
  deleteExpired: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/config/config', () => ({ config: { env: 'production' } }));
vi.mock('@/providers/redis', () => ({
  redis: {
    get client() {
      return mock.redisClient;
    },
  },
}));
vi.mock('@/db', () => ({
  db: {
    walletAuth: {
      nonces: {
        deleteExpired: mock.deleteExpired,
        create: mock.create,
      },
    },
  },
}));

import { config as publicConfig } from '@/config/public';

import { POST } from './route';

describe('POST /api/auth/message', () => {
  const validAddress =
    publicConfig.network === 'testnet4'
      ? 'tb1qxgmgsyq62pgsz7xclvpnv2lal00l8pz220uw2z'
      : 'bc1pkkfwul773ujrlr5f5wq6auzxpw4uals4anj4z95k0nf0qx7s5vpq4nrtw7';

  const request = (address: string) =>
    new NextRequest('http://localhost/api/auth/message', {
      method: 'POST',
      body: JSON.stringify({ address }),
      headers: { 'content-type': 'application/json', 'x-real-ip': '127.0.0.1' },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mock.redisClient = null;
  });

  it('rejects malformed addresses before database work', async () => {
    const response = await POST(request('not-an-address'));

    expect(response.status).toBe(400);
    expect(mock.create).not.toHaveBeenCalled();
  });

  it('fails closed in production when the limiter is unavailable', async () => {
    const response = await POST(request(validAddress));

    expect(response.status).toBe(503);
    expect(mock.create).not.toHaveBeenCalled();
  });

  it('returns 429 before database writes when either budget is exhausted', async () => {
    mock.redisClient = {
      eval: vi.fn().mockResolvedValueOnce(21).mockResolvedValueOnce(1),
    };

    const response = await POST(request(validAddress));

    expect(response.status).toBe(429);
    expect(mock.create).not.toHaveBeenCalled();
  });
});
