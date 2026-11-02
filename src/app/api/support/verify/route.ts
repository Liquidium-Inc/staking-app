import { NextRequest, NextResponse } from 'next/server';

import { config } from '@/config/config';
import { db } from '@/db';
import { supportError } from '@/server/support/auth';
import { SupportErrorCode } from '@/server/support/constants';
import { handleSupportRequest } from '@/server/support/handler';
import { tokenIdentitySchema } from '@/server/support/identity';
import { isUsableTokenSecret, verifySupportToken } from '@/server/support/token';

export const dynamic = 'force-dynamic';

const HTTP_UNAUTHORIZED = 401;

export const POST = (request: NextRequest) =>
  handleSupportRequest(request, tokenIdentitySchema, async ({ token }) => {
    const secret = config.support.tokenSecret;
    const verified = isUsableTokenSecret(secret) ? verifySupportToken(token, secret) : null;
    if (!verified) return supportError(SupportErrorCode.Unauthorized, HTTP_UNAUTHORIZED);

    // Read here rather than from the token: the Worker only uses it as the chat's reply address.
    // The subject is the signed-in wallet, and only that wallet's session can subscribe it.
    const [subscription] = await db.emailSubscription.getByAddress(verified.subject);

    return NextResponse.json({
      subject: verified.subject,
      addresses: verified.addresses.map(({ address, kind, chain }) => ({ address, kind, chain })),
      expiresAt: verified.expiresAt,
      ...(subscription?.isVerified ? { verifiedEmail: subscription.email } : {}),
    });
  });
