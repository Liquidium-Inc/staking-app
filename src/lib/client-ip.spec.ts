import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTrustedClientIp } from './client-ip';

describe('getTrustedClientIp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('trusts only the first x-forwarded-for address in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const request = new NextRequest('https://example.com', {
      headers: {
        'x-forwarded-for': '198.51.100.1, 198.51.100.2',
        'x-vercel-forwarded-for': '203.0.113.1, 203.0.113.2',
        'x-real-ip': '192.0.2.1',
      },
    });

    expect(getTrustedClientIp(request)).toBe('198.51.100.1');
  });

  it('does not fall back to other forwarding headers in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const request = new NextRequest('https://example.com', {
      headers: {
        'x-vercel-forwarded-for': '203.0.113.1',
        'x-real-ip': '198.51.100.2',
      },
    });

    expect(getTrustedClientIp(request)).toBe('unknown');
  });

  it('preserves practical forwarding fallbacks outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const vercelRequest = new NextRequest('https://example.com', {
      headers: { 'x-vercel-forwarded-for': '203.0.113.1, 203.0.113.2' },
    });
    const realIpRequest = new NextRequest('https://example.com', {
      headers: { 'x-real-ip': '198.51.100.2' },
    });

    expect(getTrustedClientIp(vercelRequest)).toBe('203.0.113.1');
    expect(getTrustedClientIp(realIpRequest)).toBe('198.51.100.2');
  });
});
