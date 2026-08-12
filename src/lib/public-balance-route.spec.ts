import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: { env: 'production' },
  redisClient: null as null | {
    eval: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('@/config/config', () => ({ config: mocks.config }));
vi.mock('@/providers/redis', () => ({
  redis: {
    get client() {
      return mocks.redisClient;
    },
  },
}));

import { protectPublicBalanceRoute } from './public-balance-route';

const request = (query = 'address=bc1ptest') =>
  new NextRequest(`https://example.com/api/account/balance?${query}`, {
    headers: { 'x-forwarded-for': '203.0.113.1' },
  });

const handler = vi.fn<(request: Request) => Promise<NextResponse<unknown>>>(async () =>
  NextResponse.json({ total_balance: '42' }),
);

describe('protectPublicBalanceRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.env = 'production';
    mocks.redisClient = {
      eval: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    };
    handler.mockResolvedValue(NextResponse.json({ total_balance: '42' }));
  });

  it('rejects invalid queries before consuming quota', async () => {
    const response = await protectPublicBalanceRoute(request('address='), 'balance', handler);

    expect(response.status).toBe(400);
    expect(mocks.redisClient?.eval).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After before cache or upstream work', async () => {
    mocks.redisClient!.eval.mockResolvedValue(61);

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mocks.redisClient?.get).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('serves a cache hit only after consuming quota', async () => {
    mocks.redisClient!.get.mockResolvedValue(JSON.stringify({ total_balance: '7' }));

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(await response.json()).toEqual({ total_balance: '7' });
    expect(mocks.redisClient?.eval).toHaveBeenCalledOnce();
    expect(mocks.redisClient?.get).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it('caches successful normalized responses briefly', async () => {
    const response = await protectPublicBalanceRoute(
      request('address=%20bc1ptest%20&tokenId=%20token%20'),
      'balance',
      handler,
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/api/account/balance?address=bc1ptest&tokenId=token',
      }),
    );
    expect(mocks.redisClient?.set).toHaveBeenCalledWith(
      'cache:public-balance:balance:bc1ptest:token',
      JSON.stringify({ total_balance: '42' }),
      'EX',
      30,
    );
  });

  it('does not cache error responses', async () => {
    handler.mockResolvedValue(NextResponse.json({ error: 'upstream failed' }, { status: 502 }));

    const response = await protectPublicBalanceRoute(request(), 'btc-balance', handler);

    expect(response.status).toBe(502);
    expect(mocks.redisClient?.set).not.toHaveBeenCalled();
  });

  it('fails closed in production when the limiter is unavailable', async () => {
    mocks.redisClient = null;

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it('fails closed in production when the limiter errors', async () => {
    mocks.redisClient!.eval.mockRejectedValue(new Error('Redis unavailable'));

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it('preserves the non-production fail-open convention for limiter outages', async () => {
    mocks.config.env = 'development';
    mocks.redisClient = null;

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('fails open when cache access fails', async () => {
    mocks.redisClient!.get.mockRejectedValue(new Error('Cache unavailable'));

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns the successful response when the cache write fails', async () => {
    mocks.redisClient!.set.mockRejectedValue(new Error('Cache unavailable'));

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ total_balance: '42' });
  });
});
