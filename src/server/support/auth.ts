import { createHash, timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { SupportErrorCode } from './constants';

const BEARER_PREFIX = 'Bearer ';
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

export function supportError(code: SupportErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

/** Constant-time comparison; hashing first keeps the comparison length-independent. */
export function isSupportApiKeyValid(authorization: string | null, apiKey: string) {
  if (!authorization?.startsWith(BEARER_PREFIX)) return false;
  const provided = authorization.slice(BEARER_PREFIX.length).trim();
  if (!provided) return false;
  return timingSafeEqual(digest(provided), digest(apiKey));
}

/**
 * Guards server-to-server support routes. Returns a response to send when the
 * request is rejected, or null when it may proceed. The feature is off (404)
 * until SUPPORT_API_KEY is set.
 */
export function rejectUnauthorizedSupportRequest(
  request: Request,
  apiKey: string | undefined,
): NextResponse | null {
  if (!apiKey) return supportError(SupportErrorCode.NotFound, HTTP_NOT_FOUND);
  if (!isSupportApiKeyValid(request.headers.get('authorization'), apiKey)) {
    return supportError(SupportErrorCode.Unauthorized, HTTP_UNAUTHORIZED);
  }
  return null;
}
