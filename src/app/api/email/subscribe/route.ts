import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db, EMAIL_TOKEN_PURPOSE } from '@/db';
import { logger } from '@/lib/logger';
import { emailService } from '@/providers/email';
import { redis } from '@/providers/redis';
import { requireSession, UnauthorizedError } from '@/server/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_KEY_PREFIX = 'rate-limit:subscribe:';

async function checkRateLimit(ip: string): Promise<boolean> {
  const redisClient = redis.client;

  if (!redisClient) {
    // Redis is optional, so skip strict enforcing in non-production setups.
    return true;
  }

  const key = `${RATE_LIMIT_KEY_PREFIX}${ip}`;

  try {
    const requestCount = await redisClient.incr(key);

    if (requestCount === 1) {
      await redisClient.pexpire(key, RATE_LIMIT_WINDOW_MS);
    }

    return requestCount <= RATE_LIMIT_MAX_REQUESTS;
  } catch (error) {
    logger.error('Rate limit check failed', { error, key });
    // Fail open to avoid blocking users if Redis is unavailable.
    return true;
  }
}

const subscribeSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  email: z
    .string()
    .email('Valid email is required')
    .max(254, 'Email address is too long')
    .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid email format'),
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message: 'You must agree to the privacy policy',
  }),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limiting check
    const clientIP =
      req.headers.get('x-forwarded-for')?.split(',')[0] ||
      req.headers.get('x-real-ip') ||
      'unknown';

    if (!(await checkRateLimit(clientIP))) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { address, email, agreeToTerms } = subscribeSchema.parse(body);
    // agreeToTerms is validated by Zod schema above - no additional logic needed

    const session = await requireSession(req);

    if (session.address.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if already verified
    const existingSubscriptions = await db.emailSubscription.getByAddress(address);
    const existingSubscription = existingSubscriptions.find((sub) => sub.email === email);

    if (existingSubscription?.isVerified) {
      return NextResponse.json(
        { success: false, error: 'Email already verified for this address' },
        { status: 400 },
      );
    }

    // Create subscription and verification token
    await db.emailSubscription.insert(address, email);

    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.emailSubscription.insertVerificationToken(
      address,
      email,
      token,
      expiresAt,
      EMAIL_TOKEN_PURPOSE.VERIFY,
    );

    // Send verification email
    const template = emailService.generateVerificationEmail(token);
    const result = await emailService.sendEmail(email, template);

    if (!result.success) {
      logger.error('Failed to send verification email', { address, email, error: result.error });
      return NextResponse.json(
        { success: false, error: 'Failed to send verification email' },
        { status: 500 },
      );
    }

    logger.info('Email subscription created', { address, email });

    return NextResponse.json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    });
  } catch (error) {
    logger.error('Email subscription error', { error });

    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: error.errors },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
