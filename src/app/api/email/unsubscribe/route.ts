import { NextRequest, NextResponse } from 'next/server';

import { db, EMAIL_TOKEN_PURPOSE } from '@/db';
import { requireSession, UnauthorizedError } from '@/server/auth/session';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');
    const token = searchParams.get('token');

    if (!address || !token) {
      return NextResponse.redirect(new URL('/?error=missing_parameters', req.url));
    }

    const verificationToken = await db.emailSubscription.getVerificationToken(
      token,
      EMAIL_TOKEN_PURPOSE.UNSUBSCRIBE,
    );

    if (!verificationToken) {
      return NextResponse.redirect(new URL('/?error=invalid_token', req.url));
    }

    if (verificationToken.address.toLowerCase() !== address.toLowerCase()) {
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
    const { address, token } = await req.json();

    if (!address) {
      return NextResponse.json(
        {
          success: false,
          error: 'Address is required',
        },
        { status: 400 },
      );
    }

    if (token) {
      const verificationToken = await db.emailSubscription.getVerificationToken(
        token,
        EMAIL_TOKEN_PURPOSE.UNSUBSCRIBE,
      );

      if (!verificationToken) {
        return NextResponse.json(
          { success: false, error: 'Invalid unsubscribe token' },
          { status: 400 },
        );
      }

      if (verificationToken.address.toLowerCase() !== address.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: 'Token does not match address' },
          { status: 403 },
        );
      }

      if (new Date() > verificationToken.expiresAt) {
        await db.emailSubscription.deleteVerificationToken(token);
        return NextResponse.json(
          { success: false, error: 'Unsubscribe token expired' },
          { status: 400 },
        );
      }
    } else {
      const session = await requireSession(req);

      if (session.address.toLowerCase() !== address.toLowerCase()) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
      }
    }

    // Unsubscribe by address
    await db.emailSubscription.unsubscribe(address);

    // If a token was provided and valid, best-effort cleanup after success
    if (token) {
      await db.emailSubscription.deleteVerificationToken(token);
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully unsubscribed from email notifications',
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
}
