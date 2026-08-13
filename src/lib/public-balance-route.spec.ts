import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: { env: 'production' },
  logger: {
    error: vi.fn(),
  },
  redisClient: null as null | {
    eval: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('@/config/config', () => ({ config: mocks.config }));
vi.mock('@/lib/logger', () => ({ logger: mocks.logger }));
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
    };
    handler.mockResolvedValue(NextResponse.json({ total_balance: '42' }));
  });

  it('rejects invalid queries before consuming quota', async () => {
    const response = await protectPublicBalanceRoute(request('address='), 'balance', handler);

    expect(response.status).toBe(400);
    expect(mocks.redisClient?.eval).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects tokenId on the BTC endpoint before consuming quota', async () => {
    const response = await protectPublicBalanceRoute(
      request('address=bc1ptest&tokenId=ignored'),
      'btc-balance',
      handler,
    );

    expect(response.status).toBe(400);
    expect(mocks.redisClient?.eval).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After before upstream work', async () => {
    mocks.redisClient!.eval.mockResolvedValue(61);

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(handler).not.toHaveBeenCalled();
  });

  it('normalizes validated queries before upstream work', async () => {
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
  });

  it('fails closed in production when the limiter is unavailable', async () => {
    mocks.redisClient = null;

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it('fails closed in production when the limiter errors', async () => {
    mocks.redisClient!.eval.mockRejectedValue(
      new Error('Redis command included rate-limit:public-balance:203.0.113.1'),
    );

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.logger.error).toHaveBeenCalledWith('Public balance rate limit failed', {
      endpoint: 'balance',
      reason: 'rate-limit backend unavailable',
    });
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain('203.0.113.1');
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain(
      'rate-limit:public-balance',
    );
  });

  it('preserves the non-production fail-open convention for limiter outages', async () => {
    mocks.config.env = 'development';
    mocks.redisClient = null;

    const response = await protectPublicBalanceRoute(request(), 'balance', handler);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });
});
