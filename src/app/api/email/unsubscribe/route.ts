import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db, EMAIL_TOKEN_PURPOSE } from '@/db';
import { addressesMatch } from '@/lib/address';
import { requireSession, UnauthorizedError } from '@/server/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const getQuerySchema = z.object({
  address: z.string().min(1, 'Address is required'),
  token: z.string().min(1, 'Token is required'),
});

const postBodySchema = z.object({
  address: z.string().min(1, 'Address is required'),
  token: z.string().optional(),
});

const successResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryResult = getQuerySchema.safeParse(Object.fromEntries(searchParams));

    if (!queryResult.success) {
      return NextResponse.redirect(
        new URL(
          `/?error=${encodeURIComponent(queryResult.error.errors[0]?.message ?? 'Invalid parameters')}`,
          req.url,
        ),
      );
    }

    const { address, token } = queryResult.data;

    const verificationToken = await db.emailSubscription.getVerificationToken(
      token,
      EMAIL_TOKEN_PURPOSE.UNSUBSCRIBE,
    );

    if (!verificationToken) {
      return NextResponse.redirect(new URL('/?error=invalid_token', req.url));
    }

    if (!addressesMatch(verificationToken.address, address)) {
      return NextResponse.redirect(new URL('/?error=token_address_mismatch', req.url));
    }

    if (new Date() > verificationToken.expiresAt) {
      await db.emailSubscription.deleteVerificationToken(token);
      return NextResponse.redirect(new URL('/?error=token_expired', req.url));
    }

    await db.emailSubscription.unsubscribe(verificationToken.address);

    // Best-effort cleanup of the used unsubscribe token
    await db.emailSubscription.deleteVerificationToken(token);

    // Redirect to success page
    return NextResponse.redirect(new URL('/?email_unsubscribed=true', req.url));
  } catch {
    return NextResponse.redirect(new URL('/?error=unsubscribe_failed', req.url));
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const bodyResult = postBodySchema.safeParse(body);

    if (!bodyResult.success) {
      const response = errorResponseSchema.parse({
        success: false,
        error: bodyResult.error.errors[0]?.message ?? 'Invalid request body',
      });
      return NextResponse.json(response, { status: 400 });
    }

    const { address, token } = bodyResult.data;

    if (token) {
      const verificationToken = await db.emailSubscription.getVerificationToken(
        token,
        EMAIL_TOKEN_PURPOSE.UNSUBSCRIBE,
      );

      if (!verificationToken) {
        const response = errorResponseSchema.parse({
          success: false,
          error: 'Invalid unsubscribe token',
        });
        return NextResponse.json(response, { status: 400 });
      }

      if (!addressesMatch(verificationToken.address, address)) {
        const response = errorResponseSchema.parse({
          success: false,
          error: 'Token does not match address',
        });
        return NextResponse.json(response, { status: 403 });
      }

      if (new Date() > verificationToken.expiresAt) {
        await db.emailSubscription.deleteVerificationToken(token);
        const response = errorResponseSchema.parse({
          success: false,
          error: 'Unsubscribe token expired',
        });
        return NextResponse.json(response, { status: 400 });
      }
    } else {
      const session = await requireSession(req);

      if (!addressesMatch(session.address, address)) {
        const response = errorResponseSchema.parse({
          success: false,
          error: 'Unauthorized',
        });
        return NextResponse.json(response, { status: 403 });
      }
    }

    // Unsubscribe by address
    await db.emailSubscription.unsubscribe(address);

    // If a token was provided and valid, best-effort cleanup after success
    if (token) {
      await db.emailSubscription.deleteVerificationToken(token);
    }

    const response = successResponseSchema.parse({
      success: true,
      message: 'Successfully unsubscribed from email notifications',
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const response = errorResponseSchema.parse({
        success: false,
        error: 'Unauthorized',
      });
      return NextResponse.json(response, { status: 401 });
    }

    const response = errorResponseSchema.parse({
      success: false,
      error: 'Internal server error',
    });
    return NextResponse.json(response, { status: 500 });
  }
}
