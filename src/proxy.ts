import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function proxy(_req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/debug/:path*'],
};
