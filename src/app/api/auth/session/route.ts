import { NextRequest, NextResponse } from 'next/server';

import { getSessionFromRequest } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  return NextResponse.json({
    authenticated: true,
    address: session.address,
    expiresAt: session.expiresAt.toISOString(),
  });
}
