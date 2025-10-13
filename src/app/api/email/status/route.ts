import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { logger } from '@/lib/logger';
import { requireSession, UnauthorizedError } from '@/server/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({
  address: z.string().min(1, 'Address is required'),
});

const responseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      subscribed: z.boolean(),
      email: z.string().nullable(),
      isVerified: z.boolean(),
    })
    .optional(),
  error: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);

    const { searchParams } = new URL(req.url);
    const queryResult = querySchema.safeParse(Object.fromEntries(searchParams));

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: queryResult.error.errors[0]?.message ?? 'Invalid request parameters',
        },
        { status: 400 },
      );
    }

    const { address } = queryResult.data;

    if (session.address.toLowerCase() !== address.toLowerCase()) {
      const response = responseSchema.parse({
        success: false,
        error: 'Forbidden: You can only access your own email status',
      });
      return NextResponse.json(response, { status: 403 });
    }

    // Get subscription for the address (unique by address)
    const subscriptions = await db.emailSubscription.getByAddress(address);

    if (!subscriptions.length) {
      const response = responseSchema.parse({
        success: true,
        data: {
          subscribed: false,
          email: null,
          isVerified: false,
        },
      });
      return NextResponse.json(response);
    }

    // Single row per address expected
    const latestSubscription = subscriptions[0];

    const response = responseSchema.parse({
      success: true,
      data: {
        subscribed: true,
        email: latestSubscription.email,
        isVerified: latestSubscription.isVerified,
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const response = responseSchema.parse({
        success: false,
        error: 'Unauthorized: Please connect your wallet',
      });
      return NextResponse.json(response, { status: 401 });
    }

    logger.error('Email status check error', { error });
    const response = responseSchema.parse({
      success: false,
      error: 'Internal server error',
    });
    return NextResponse.json(response, { status: 500 });
  }
}
