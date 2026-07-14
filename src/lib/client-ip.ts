import type { NextRequest } from 'next/server';

const UNKNOWN_CLIENT_IP = 'unknown';

function firstForwardedAddress(value: string | null) {
  return value?.split(',')[0]?.trim() || null;
}

export function getTrustedClientIp(request: NextRequest) {
  const vercelForwardedFor = firstForwardedAddress(request.headers.get('x-vercel-forwarded-for'));
  if (vercelForwardedFor) return vercelForwardedFor;

  if (process.env.NODE_ENV !== 'production') {
    return (
      firstForwardedAddress(request.headers.get('x-forwarded-for')) ||
      request.headers.get('x-real-ip')?.trim() ||
      UNKNOWN_CLIENT_IP
    );
  }

  return UNKNOWN_CLIENT_IP;
}
