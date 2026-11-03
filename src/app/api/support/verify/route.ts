import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { config } from '@/config/config';
import { db } from '@/db';
import { logger } from '@/lib/logger';
import { supportError } from '@/server/support/auth';
import { SupportErrorCode } from '@/server/support/constants';
import { handleSupportRequest } from '@/server/support/handler';
import { tokenIdentitySchema } from '@/server/support/identity';
import { isUsableTokenSecret, verifySupportToken } from '@/server/support/token';

export const dynamic = 'force-dynamic';

const HTTP_UNAUTHORIZED = 401;

const verifyResponseSchema = z.object({
  subject: z.string(),
  addresses: z.array(z.object({ address: z.string(), kind: z.string(), chain: z.string() })),
  expiresAt: z.number(),
  verifiedEmail: z.string().optional(),
});

/** The email is optional for support, so a database failure must not fail a valid token. */
async function readVerifiedEmail(address: string): Promise<string | undefined> {
  try {
    const [subscription] = await db.emailSubscription.getByAddress(address);
    return subscription?.isVerified ? subscription.email : undefined;
  } catch (error) {
    logger.error('support: verified email lookup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export const POST = (request: NextRequest) =>
  handleSupportRequest(request, tokenIdentitySchema, async ({ token }) => {
    const secret = config.support.tokenSecret;
    const verified = isUsableTokenSecret(secret) ? verifySupportToken(token, secret) : null;
    if (!verified) return supportError(SupportErrorCode.Unauthorized, HTTP_UNAUTHORIZED);

    // Read here rather than from the token: the Worker only uses it as the chat's reply address.
    // The subject is the signed-in wallet, and only that wallet's session can subscribe it.
    const verifiedEmail = await readVerifiedEmail(verified.subject);

    return NextResponse.json(
      verifyResponseSchema.parse({
        subject: verified.subject,
        addresses: verified.addresses,
        expiresAt: verified.expiresAt,
        ...(verifiedEmail ? { verifiedEmail } : {}),
      }),
    );
  });
