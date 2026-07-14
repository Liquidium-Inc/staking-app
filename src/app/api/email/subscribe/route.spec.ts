import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  redisClient: null as null | {
    eval: ReturnType<typeof vi.fn>;
  },
  getByAddress: vi.fn(),
}));

vi.mock('@/providers/redis', () => ({
  redis: {
    get client() {
      return mock.redisClient;
    },
  },
}));
vi.mock('@/db', () => ({
  EMAIL_TOKEN_PURPOSE: { VERIFY: 'verify' },
  db: {
    emailSubscription: {
      getByAddress: mock.getByAddress,
      insert: vi.fn(),
      insertVerificationToken: vi.fn(),
    },
  },
}));

import { checkEmailSubscriptionRateLimit, EmailRateLimitResult } from '@/lib/email-rate-limit';

import { POST } from './route';

describe('email subscription rate limiting', () => {
  beforeEach(() => {
    mock.redisClient = null;
  });

  it('fails closed when Redis is unavailable', async () => {
    await expect(checkEmailSubscriptionRateLimit('127.0.0.1')).resolves.toBe(
      EmailRateLimitResult.Unavailable,
    );
  });

  it('fails closed when Redis errors', async () => {
    mock.redisClient = {
      eval: vi.fn().mockRejectedValue(new Error('offline')),
    };

    await expect(checkEmailSubscriptionRateLimit('127.0.0.1')).resolves.toBe(
      EmailRateLimitResult.Unavailable,
    );
  });

  it('enforces the configured request ceiling', async () => {
    mock.redisClient = {
      eval: vi.fn().mockResolvedValue(6),
    };

    await expect(checkEmailSubscriptionRateLimit('127.0.0.1')).resolves.toBe(
      EmailRateLimitResult.Limited,
    );
  });

  it('returns 429 before subscription work when the request ceiling is exhausted', async () => {
    mock.redisClient = {
      eval: vi.fn().mockResolvedValue(6),
    };

    const response = await POST(
      new NextRequest('http://localhost/api/email/subscribe', { method: 'POST' }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Too many requests. Please try again later.',
    });
    expect(mock.getByAddress).not.toHaveBeenCalled();
  });

  it('returns 503 before subscription work when the limiter is unavailable', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/email/subscribe', { method: 'POST' }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Email subscriptions are temporarily unavailable.',
    });
    expect(mock.getByAddress).not.toHaveBeenCalled();
  });
});
