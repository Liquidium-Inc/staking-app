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

const url = 'http://localhost/api/terms';
const post = (version: string) =>
  new NextRequest(url, { method: 'POST', body: JSON.stringify({ version }) });

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

  it('rejects an out-of-date version', async () => {
    const response = await POST(post('1.0'));

    expect(response.status).toBe(400);
    expect(mock.accept).not.toHaveBeenCalled();
  });
});
