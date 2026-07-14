import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTrustedClientIp } from './client-ip';

describe('getTrustedClientIp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers the platform-controlled Vercel forwarding header', () => {
    const request = new NextRequest('https://example.com', {
      headers: {
        'x-forwarded-for': '198.51.100.1',
        'x-vercel-forwarded-for': '203.0.113.1, 203.0.113.2',
      },
    });

    expect(getTrustedClientIp(request)).toBe('203.0.113.1');
  });

  it('does not trust client-controlled forwarding headers in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const request = new NextRequest('https://example.com', {
      headers: { 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.2' },
    });

    expect(getTrustedClientIp(request)).toBe('unknown');
  });
});
