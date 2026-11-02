import { NextRequest, NextResponse } from 'next/server';

import { config } from '@/config/config';
import { consumeFixedWindowRateLimit } from '@/lib/fixed-window-rate-limit';
import { logger } from '@/lib/logger';
import { redis } from '@/providers/redis';
import { requireSession, UnauthorizedError } from '@/server/auth/session';
import { supportError } from '@/server/support/auth';
import { SupportErrorCode } from '@/server/support/constants';
import { isUsableTokenSecret, issueSupportToken } from '@/server/support/token';

export const dynamic = 'force-dynamic';

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_INTERNAL_SERVER_ERROR = 500;

// Same fixed-window limiter as the wallet challenge route. The widget refreshes
// the 15-minute token on demand, so a handful per window is plenty.
const TOKEN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const TOKEN_RATE_LIMIT_PER_ADDRESS = 30;
const TOKEN_RATE_LIMIT_PREFIX = 'rate-limit:support-token:';

async function isWithinRateLimit(address: string): Promise<boolean | null> {
  const redisClient = redis.client;
  if (!redisClient) return config.env === 'production' ? null : true;

  try {
    const count = await consumeFixedWindowRateLimit(
      redisClient,
      `${TOKEN_RATE_LIMIT_PREFIX}${address}`,
      TOKEN_RATE_LIMIT_WINDOW_MS,
    );
    return count <= TOKEN_RATE_LIMIT_PER_ADDRESS;
  } catch (error) {
    logger.error('Support token rate limit failed', { error });
    return config.env === 'production' ? null : true;
  }
}

export async function POST(request: NextRequest) {
  const secret = config.support.tokenSecret;
  if (!isUsableTokenSecret(secret)) return supportError(SupportErrorCode.NotFound, HTTP_NOT_FOUND);

  try {
    const session = await requireSession(request);

    const allowed = await isWithinRateLimit(session.address);
    if (allowed === null) {
      return supportError(SupportErrorCode.Unavailable, HTTP_SERVICE_UNAVAILABLE);
    }
    if (!allowed) return supportError(SupportErrorCode.RateLimited, HTTP_TOO_MANY_REQUESTS);

    return NextResponse.json(issueSupportToken(session.address, secret));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return supportError(SupportErrorCode.Unauthorized, HTTP_UNAUTHORIZED);
    }
    logger.error('Failed to issue support token', {
      error: error instanceof Error ? error.message : String(error),
    });
    return supportError(SupportErrorCode.Internal, HTTP_INTERNAL_SERVER_ERROR);
  }
}
