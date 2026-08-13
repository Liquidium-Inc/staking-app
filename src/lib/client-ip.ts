import type { NextRequest } from 'next/server';

import { config } from '@/config/config';

const UNKNOWN_CLIENT_IP = 'unknown';

function firstForwardedAddress(value: string | null) {
  return value?.split(',')[0]?.trim() || null;
}

export function getTrustedClientIp(request: NextRequest) {
  const forwardedFor = firstForwardedAddress(request.headers.get('x-forwarded-for'));

  if (config.env === 'production') {
    return forwardedFor || UNKNOWN_CLIENT_IP;
  }

  return (
    forwardedFor ||
    firstForwardedAddress(request.headers.get('x-vercel-forwarded-for')) ||
    request.headers.get('x-real-ip')?.trim() ||
    UNKNOWN_CLIENT_IP
  );
}
