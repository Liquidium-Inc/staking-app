import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN_SECRET = 's'.repeat(32);
const SESSION_ADDRESS = 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c';

const mock = vi.hoisted(() => ({
  support: { tokenSecret: undefined as string | undefined },
  requireSession: vi.fn(),
}));

vi.mock('@/config/config', () => ({ config: { env: 'test', support: mock.support } }));
vi.mock('@/providers/redis', () => ({ redis: { client: null } }));
vi.mock('@/server/auth/session', () => ({
  requireSession: mock.requireSession,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { UnauthorizedError } from '@/server/auth/session';
import { verifySupportToken } from '@/server/support/token';

import { POST } from './route';

const request = () => new NextRequest('http://localhost/api/support/token', { method: 'POST' });

describe('POST /api/support/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.support.tokenSecret = TOKEN_SECRET;
  });

  it('returns 404 when SUPPORT_TOKEN_SECRET is unset', async () => {
    mock.support.tokenSecret = undefined;
    expect((await POST(request())).status).toBe(404);
    expect(mock.requireSession).not.toHaveBeenCalled();
  });

  it('returns 401 without a wallet session', async () => {
    mock.requireSession.mockRejectedValue(new UnauthorizedError());
    expect((await POST(request())).status).toBe(401);
  });

  it('mints a token holding only the session address', async () => {
    mock.requireSession.mockResolvedValue({ address: SESSION_ADDRESS, tokenHash: 'hash' });

    const response = await POST(request());
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(['expiresAt', 'token']);
    expect(verifySupportToken(body.token, TOKEN_SECRET)?.addresses).toEqual([
      { address: SESSION_ADDRESS, kind: 'ordinals', chain: 'bitcoin' },
    ]);
    expect(body.token).not.toContain('hash');
  });
});
