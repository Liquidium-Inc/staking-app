import { randomUUID } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { logger } from '@/lib/logger';

const requestSchema = z.object({
  address: z.string().min(1, 'Address is required'),
});

const NONCE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const dynamic = 'force-dynamic';

function formatMessage(address: string, nonce: string) {
  return `Please sign this message to verify your wallet\naddress: ${address}\nnonce: ${nonce}\n`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { address } = parsed.data;

    const nonce = randomUUID();
    const message = formatMessage(address, nonce);
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);

    await db.walletAuth.nonces.deleteExpired(new Date());
    await db.walletAuth.nonces.create({
      address,
      message,
      nonce,
      expiresAt,
    });

    return NextResponse.json({ message, nonce, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    logger.error('Failed to generate wallet auth message', error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
