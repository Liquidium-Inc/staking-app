import { consumeFixedWindowRateLimit } from '@/lib/fixed-window-rate-limit';
import { logger } from '@/lib/logger';
import { redis } from '@/providers/redis';

const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_KEY_PREFIX = 'rate-limit:subscribe:';

export const EmailRateLimitResult = {
  Allowed: 'allowed',
  Limited: 'limited',
  Unavailable: 'unavailable',
} as const;

type EmailRateLimitResult = (typeof EmailRateLimitResult)[keyof typeof EmailRateLimitResult];

export async function checkEmailSubscriptionRateLimit(ip: string): Promise<EmailRateLimitResult> {
  const redisClient = redis.client;

  if (!redisClient) {
    return EmailRateLimitResult.Unavailable;
  }

  const key = `${RATE_LIMIT_KEY_PREFIX}${ip}`;

  try {
    const requestCount = await consumeFixedWindowRateLimit(redisClient, key, RATE_LIMIT_WINDOW_MS);

    return requestCount <= RATE_LIMIT_MAX_REQUESTS
      ? EmailRateLimitResult.Allowed
      : EmailRateLimitResult.Limited;
  } catch (error) {
    logger.error('Rate limit check failed', { error, key });
    return EmailRateLimitResult.Unavailable;
  }
}
