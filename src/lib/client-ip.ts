import type { NextRequest } from 'next/server';

const UNKNOWN_CLIENT_IP = 'unknown';

function firstForwardedAddress(value: string | null) {
  return value?.split(',')[0]?.trim() || null;
}

export function getTrustedClientIp(request: NextRequest) {
  const forwardedFor = firstForwardedAddress(request.headers.get('x-forwarded-for'));

  if (process.env.NODE_ENV === 'production') {
    return forwardedFor || UNKNOWN_CLIENT_IP;
  }

  return (
    forwardedFor ||
    firstForwardedAddress(request.headers.get('x-vercel-forwarded-for')) ||
    request.headers.get('x-real-ip')?.trim() ||
    UNKNOWN_CLIENT_IP
  );
}
