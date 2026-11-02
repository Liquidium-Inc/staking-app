import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { logger } from '@/lib/logger';
import { TERMS_EFFECTIVE_AT, TERMS_VERSION } from '@/lib/terms';
import { requireSession, UnauthorizedError } from '@/server/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const acceptSchema = z.object({ version: z.literal(TERMS_VERSION) });

function errorResponse(error: unknown, message: string) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  logger.error(message, { error });
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const { address } = await requireSession(req);
    const pending =
      (await db.terms.usedAppBefore(address, TERMS_EFFECTIVE_AT)) &&
      !(await db.terms.hasAccepted(address, TERMS_VERSION));
    return NextResponse.json({ pendingVersion: pending ? TERMS_VERSION : null });
  } catch (error) {
    return errorResponse(error, 'Terms status check error');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { address } = await requireSession(req);
    const body = acceptSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Terms version is out of date' }, { status: 400 });
    }
    await db.terms.accept(address, body.data.version);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, 'Terms acceptance error');
  }
}
