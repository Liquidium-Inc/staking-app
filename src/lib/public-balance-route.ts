import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { config } from '@/config/config';
import { getTrustedClientIp } from '@/lib/client-ip';
import { consumeFixedWindowRateLimit } from '@/lib/fixed-window-rate-limit';
import { logger } from '@/lib/logger';
import { redis } from '@/providers/redis';

const RATE_LIMIT_MAX_REQUESTS = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const CACHE_TTL_SECONDS = 30;
const RATE_LIMIT_KEY_PREFIX = 'rate-limit:public-balance:';
const CACHE_KEY_PREFIX = 'cache:public-balance:';

const querySchema = z.object({
  address: z.string().trim().min(1).max(120),
  tokenId: z.string().trim().min(1).max(120).optional(),
});

type BalanceHandler = (request: Request) => Promise<NextResponse<unknown>>;
type BalanceHandlerBody<T extends BalanceHandler> =
  Awaited<ReturnType<T>> extends NextResponse<infer Body> ? Body : never;
type PublicBalanceError = { error: string; details?: z.core.$ZodIssue[] };

function unavailableResponse() {
  return NextResponse.json({ error: 'Balance service temporarily unavailable' }, { status: 503 });
}

export async function protectPublicBalanceRoute<T extends BalanceHandler>(
  request: NextRequest,
  endpoint: 'balance' | 'btc-balance',
  handler: T,
): Promise<NextResponse<BalanceHandlerBody<T> | PublicBalanceError>> {
  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    address: url.searchParams.get('address'),
    tokenId: url.searchParams.get('tokenId') || undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsedQuery.error.issues },
      { status: 400 },
    );
  }

  if (endpoint === 'btc-balance' && parsedQuery.data.tokenId) {
    return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
  }

  const redisClient = redis.client;
  if (!redisClient) {
    if (config.env === 'production') return unavailableResponse();
  } else {
    const rateLimitKey = `${RATE_LIMIT_KEY_PREFIX}${getTrustedClientIp(request)}`;

    try {
      const requestCount = await consumeFixedWindowRateLimit(
        redisClient,
        rateLimitKey,
        RATE_LIMIT_WINDOW_MS,
      );
      if (requestCount > RATE_LIMIT_MAX_REQUESTS) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(RATE_LIMIT_WINDOW_MS / 1000) } },
        );
      }
    } catch (error) {
      logger.error('Public balance rate limit failed', { error, endpoint });
      if (config.env === 'production') return unavailableResponse();
    }
  }

  const normalizedUrl = new URL(request.url);
  normalizedUrl.search = '';
  normalizedUrl.searchParams.set('address', parsedQuery.data.address);
  if (parsedQuery.data.tokenId) {
    normalizedUrl.searchParams.set('tokenId', parsedQuery.data.tokenId);
  }

  const tokenSegment = parsedQuery.data.tokenId
    ? `token:${encodeURIComponent(parsedQuery.data.tokenId)}`
    : 'all';
  const cacheKey = `${CACHE_KEY_PREFIX}${endpoint}:${encodeURIComponent(parsedQuery.data.address)}:${tokenSegment}`;

  if (redisClient) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return NextResponse.json(JSON.parse(cached) as BalanceHandlerBody<T>);
    } catch (error) {
      logger.warn('Public balance cache read failed', { error, endpoint });
    }
  }

  const response = await handler(new Request(normalizedUrl, request));

  if (redisClient && response.ok) {
    try {
      const body = await response.clone().json();
      await redisClient.set(cacheKey, JSON.stringify(body), 'EX', CACHE_TTL_SECONDS);
    } catch (error) {
      logger.warn('Public balance cache write failed', { error, endpoint });
    }
  }

  return response as NextResponse<BalanceHandlerBody<T>>;
}
