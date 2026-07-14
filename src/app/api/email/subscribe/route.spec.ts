import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  redisClient: null as null | {
    eval: ReturnType<typeof vi.fn>;
  },
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
      getByAddress: vi.fn(),
      insert: vi.fn(),
      insertVerificationToken: vi.fn(),
    },
  },
}));

import { checkEmailSubscriptionRateLimit, EmailRateLimitResult } from '@/lib/email-rate-limit';

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
});
