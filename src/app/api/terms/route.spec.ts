import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TERMS_EFFECTIVE_AT, TERMS_VERSION } from '@/lib/terms';

import { GET, POST } from './route';

const mock = vi.hoisted(() => ({
  requireSession: vi.fn(),
  usedAppBefore: vi.fn(),
  hasAccepted: vi.fn(),
  accept: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    terms: {
      usedAppBefore: mock.usedAppBefore,
      hasAccepted: mock.hasAccepted,
      accept: mock.accept,
    },
  },
}));
vi.mock('@/server/auth/session', () => ({
  requireSession: mock.requireSession,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock('@/lib/address', () => ({
  addressesMatch: (a?: string | null, b?: string | null) => a === b,
}));

const url = 'http://localhost/api/terms?address=bc1pwallet';
const post = (version: string, address = 'bc1pwallet') =>
  new NextRequest(url, { method: 'POST', body: JSON.stringify({ address, version }) });

describe('/api/terms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.requireSession.mockResolvedValue({ address: 'bc1pwallet' });
  });

  it('asks a wallet that used the app before the terms changed', async () => {
    mock.usedAppBefore.mockResolvedValue(true);
    mock.hasAccepted.mockResolvedValue(false);

    const response = await GET(new NextRequest(url));

    expect(await response.json()).toEqual({ pendingVersion: TERMS_VERSION });
    expect(mock.usedAppBefore).toHaveBeenCalledWith('bc1pwallet', TERMS_EFFECTIVE_AT);
  });

  it('does not ask a wallet with no earlier use', async () => {
    mock.usedAppBefore.mockResolvedValue(false);

    const response = await GET(new NextRequest(url));

    expect(await response.json()).toEqual({ pendingVersion: null });
  });

  it('does not ask a wallet that already agreed', async () => {
    mock.usedAppBefore.mockResolvedValue(true);
    mock.hasAccepted.mockResolvedValue(true);

    const response = await GET(new NextRequest(url));

    expect(await response.json()).toEqual({ pendingVersion: null });
  });

  it('records agreement against the signed-in wallet', async () => {
    const response = await POST(post(TERMS_VERSION));

    expect(response.status).toBe(204);
    expect(mock.accept).toHaveBeenCalledWith('bc1pwallet', TERMS_VERSION);
  });

  it('refuses a wallet other than the signed-in one', async () => {
    const lookup = await GET(new NextRequest('http://localhost/api/terms?address=bc1pother'));
    const response = await POST(post(TERMS_VERSION, 'bc1pother'));

    expect(lookup.status).toBe(403);
    expect(response.status).toBe(403);
    expect(mock.accept).not.toHaveBeenCalled();
  });

  it('rejects an out-of-date version', async () => {
    const response = await POST(post('1.0'));

    expect(response.status).toBe(400);
    expect(mock.accept).not.toHaveBeenCalled();
  });
});
