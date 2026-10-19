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

export enum SupportErrorCode {
  BadRequest = 'bad_request',
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
