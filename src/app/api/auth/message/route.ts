import { randomUUID } from 'crypto';

import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { config } from '@/config/config';
import { db } from '@/db';
import { getBitcoinNetwork } from '@/lib/bitcoin-network';
import { getTrustedClientIp } from '@/lib/client-ip';
import { consumeFixedWindowRateLimit } from '@/lib/fixed-window-rate-limit';
import { logger } from '@/lib/logger';
import { redis } from '@/providers/redis';

const requestSchema = z.object({
  address: z.string().trim().min(1, 'Address is required').refine(isNetworkAddress, {
    message: 'Invalid address',
  }),
});
const errorResponseSchema = z.object({ error: z.string() });

const NONCE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CHALLENGE_RATE_LIMIT_WINDOW_MS = NONCE_TTL_MS;
const CHALLENGE_IP_LIMIT = 20;
const CHALLENGE_ADDRESS_LIMIT = 5;
const CHALLENGE_RATE_LIMIT_PREFIX = 'rate-limit:wallet-challenge:';

function isNetworkAddress(address: string) {
  try {
    bitcoin.address.toOutputScript(address, getBitcoinNetwork());
    return true;
  } catch {
    return false;
  }
}

async function consumeLimit(key: string, maximum: number): Promise<boolean | null> {
  const redisClient = redis.client;
  if (!redisClient) return config.env === 'production' ? null : true;

  try {
    const count = await consumeFixedWindowRateLimit(
      redisClient,
      key,
      CHALLENGE_RATE_LIMIT_WINDOW_MS,
    );
    return count <= maximum;
  } catch (error) {
    logger.error('Wallet challenge rate limit failed', { error, key });
    return config.env === 'production' ? null : true;
  }
}

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
    const clientIP = getTrustedClientIp(req);
    const [ipAllowed, addressAllowed] = await Promise.all([
      consumeLimit(`${CHALLENGE_RATE_LIMIT_PREFIX}ip:${clientIP}`, CHALLENGE_IP_LIMIT),
      consumeLimit(`${CHALLENGE_RATE_LIMIT_PREFIX}address:${address}`, CHALLENGE_ADDRESS_LIMIT),
    ]);

    if (ipAllowed === null || addressAllowed === null) {
      return NextResponse.json(
        errorResponseSchema.parse({ error: 'Wallet authentication is temporarily unavailable' }),
        { status: 503 },
      );
    }
    if (!ipAllowed || !addressAllowed) {
      return NextResponse.json(errorResponseSchema.parse({ error: 'Too many requests' }), {
        status: 429,
      });
    }

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
