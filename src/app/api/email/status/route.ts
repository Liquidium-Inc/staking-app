import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { logger } from '@/lib/logger';
import { requireSession, UnauthorizedError } from '@/server/auth/session';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);

    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        {
          success: false,
          error: 'Address is required',
        },
        { status: 400 },
      );
    }

    if (session.address.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: You can only access your own email status',
        },
        { status: 403 },
      );
    }

    // Get subscriptions for the address
    const subscriptions = await db.emailSubscription.getByAddress(address);

    if (subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          subscribed: false,
          email: null,
          isVerified: false,
        },
      });
    }

    // Return the most recent subscription
    const latestSubscription = subscriptions.reduce((latest, current) =>
      new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest,
    );

    return NextResponse.json({
      success: true,
      data: {
        subscribed: true,
        email: latestSubscription.email,
        isVerified: latestSubscription.isVerified,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Please connect your wallet',
        },
        { status: 401 },
      );
    }

    logger.error('Email status check error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
}
