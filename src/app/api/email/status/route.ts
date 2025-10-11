import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
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
