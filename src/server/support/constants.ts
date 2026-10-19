export const SUPPORT_BACKEND = 'staking';
export const SUPPORT_TOKEN_AUDIENCE = 'liquidium-support';
export const SUPPORT_TOKEN_TTL_MS = 15 * 60 * 1000;
// HS256 keys shorter than the hash output weaken the MAC; treat them as unset.
export const SUPPORT_TOKEN_SECRET_MIN_BYTES = 32;

export const SUPPORT_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://stake.liquidium.org';
export const SUPPORT_PORTFOLIO_URL = `${SUPPORT_SITE_URL}/portfolio`;
export const SUPPORT_UNSTAKE_URL = `${SUPPORT_SITE_URL}/unstake`;

export const SUPPORT_SUMMARY_ITEM_LIMIT = 20;
export const SUPPORT_RECENT_ACTIVITY_LIMIT = 10;
export const SUPPORT_LIST_DEFAULT_LIMIT = 20;
export const SUPPORT_LIST_MAX_LIMIT = 50;
// Per-address history read for counts and /list. Stakes are user-initiated, so real
// histories sit far below this; past it, totals are reported as not exact.
export const SUPPORT_HISTORY_LIMIT = 1000;
// Unsettled rows checked on chain to tell pending from never-broadcast.
export const SUPPORT_UNSETTLED_LOOKUP_LIMIT = 100;

export enum SupportErrorCode {
  BadRequest = 'bad_request',
  BadKind = 'bad_kind',
  BadFilter = 'bad_filter',
  Unauthorized = 'unauthorized',
  NotFound = 'not_found',
  RateLimited = 'rate_limited',
  Unavailable = 'unavailable',
  Internal = 'internal',
}

export enum SupportAddressKind {
  // LaserEyes exposes the rune (Ordinals/Taproot) address as the wallet address;
  // single-address wallets use the same address for payments too.
  Ordinals = 'ordinals',
}

export const SUPPORT_CHAIN = 'bitcoin';

export const MS_PER_SECOND = 1000;
