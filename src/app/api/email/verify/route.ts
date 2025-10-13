import { NextRequest, NextResponse } from 'next/server';

import { db, EMAIL_TOKEN_PURPOSE } from '@/db';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/?error=missing_token', req.url));
    }

    // Find verification token
    const verificationToken = await db.emailSubscription.getVerificationToken(
      token,
      EMAIL_TOKEN_PURPOSE.VERIFY,
    );

    if (!verificationToken) {
      return NextResponse.redirect(new URL('/?error=invalid_token', req.url));
    }

    // Check if token has expired
    if (new Date() > verificationToken.expiresAt) {
      // Clean up expired token
      await db.emailSubscription.deleteVerificationToken(token);
      return NextResponse.redirect(new URL('/?error=token_expired', req.url));
    }

    // Verify the email
    await db.emailSubscription.verifyEmail(verificationToken.email);

    // Delete the verification token
    await db.emailSubscription.deleteVerificationToken(token);

    logger.info('Email verified successfully', {
      email: verificationToken.email,
      token: token.substring(0, 8) + '...',
    });

    // Redirect to success page
    return NextResponse.redirect(new URL('/?email_verified=true', req.url));
  } catch (error) {
    logger.error('Email verification error', { error });
    return NextResponse.redirect(new URL('/?error=verification_failed', req.url));
  }
}
