import { z } from 'zod';

import { logger } from '@/lib/logger';

import { isUsableTokenSecret, verifySupportToken } from './token';

const MAX_TOKEN_LENGTH = 4096;
const MAX_ADDRESS_LENGTH = 120;

export const tokenIdentitySchema = z.object({ token: z.string().min(1).max(MAX_TOKEN_LENGTH) });

export const verifiedByIdentitySchema = z.object({
  address: z.string().trim().min(1).max(MAX_ADDRESS_LENGTH),
  verifiedBy: z.object({
    backend: z.string().min(1).max(32),
    verifiedAt: z.number().int().nonnegative(),
    tokenId: z.string().min(1).max(128),
  }),
});

export const identitySchema = z.union([tokenIdentitySchema, verifiedByIdentitySchema]);
export type SupportIdentity = z.infer<typeof identitySchema>;

/**
 * Resolves the address whose data may be read. Token identities are verified
 * here; cross-app identities come from the Worker (trusted via the API key) and
 * are logged for audit.
 */
export function resolveIdentityAddress(
  identity: SupportIdentity,
  tokenSecret: string | undefined,
): string | null {
  if ('token' in identity) {
    if (!isUsableTokenSecret(tokenSecret)) return null;
    const verified = verifySupportToken(identity.token, tokenSecret);
    return verified?.addresses[0]?.address ?? null;
  }

  logger.info('support: cross-app verified read', {
    verifiedByBackend: identity.verifiedBy.backend,
    verifiedAt: identity.verifiedBy.verifiedAt,
    tokenId: identity.verifiedBy.tokenId,
  });
  return identity.address;
}
