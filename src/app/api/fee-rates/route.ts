import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { mempool } from '@/providers/mempool';

export async function GET() {
  try {
    const fees = await mempool.fees.getFeesRecommended();

    // Validate mempool response structure
    if (
      !fees ||
      typeof fees.hourFee !== 'number' ||
      typeof fees.halfHourFee !== 'number' ||
      typeof fees.fastestFee !== 'number'
    ) {
      throw new Error('Invalid mempool response structure');
    }

    const feeRates = {
      slow: fees.hourFee,
      medium: fees.halfHourFee,
      fast: fees.fastestFee + 1, // Add buffer like current implementation
    };

    return NextResponse.json(feeRates);
  } catch (error) {
    logger.error('Failed to fetch fee rates:', error as Error);

    // Return fallback fee rates in case of failure
    const fallbackRates = {
      slow: 1,
      medium: 2,
      fast: 3,
    };

    return NextResponse.json(fallbackRates, {
      status: 200, // Return 200 with fallback data rather than 500
      headers: {
        'X-Fallback-Data': 'true',
      },
    });
  }
}
