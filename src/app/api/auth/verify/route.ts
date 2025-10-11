import { Verifier } from 'bip322-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { logger } from '@/lib/logger';
import { createSession } from '@/server/auth/session';

const verificationSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  signature: z.string().min(1, 'Signature is required'),
  nonce: z.string().min(1, 'Nonce is required'),
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = verificationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { address, signature, nonce } = parsed.data;

    const record = await db.walletAuth.nonces.consumeByValue(nonce);
    if (!record) {
      return NextResponse.json({ error: 'Invalid nonce' }, { status: 400 });
    }

    if (record.address !== address) {
      return NextResponse.json({ error: 'Address mismatch' }, { status: 400 });
    }

    if (record.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Signing request expired' }, { status: 400 });
    }

    const isValid = Verifier.verifySignature(address, record.message, signature);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { expiresAt } = await createSession(address);

    return NextResponse.json({ address, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    logger.error('Failed to verify wallet auth signature', error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
