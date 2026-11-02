import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { issueSupportToken } from '@/server/support/token';

const API_KEY = 'support-api-key-for-tests';
const TOKEN_SECRET = 's'.repeat(32);
const ADDRESS = 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c';
const EMAIL = 'customer@example.com';

const mock = vi.hoisted(() => ({
  support: { apiKey: 'unset', tokenSecret: 'unset' },
  getByAddress: vi.fn(),
}));

vi.mock('@/config/config', () => ({ config: { env: 'test', support: mock.support } }));
vi.mock('@/db', () => ({ db: { emailSubscription: { getByAddress: mock.getByAddress } } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { POST } from './route';

function verify(token: string) {
  return POST(
    new NextRequest('http://localhost/api/support/verify', {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
  );
}

describe('POST /api/support/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.support.apiKey = API_KEY;
    mock.support.tokenSecret = TOKEN_SECRET;
  });

  it('returns a verified email, read from the database and not the token', async () => {
    mock.getByAddress.mockResolvedValue([{ address: ADDRESS, email: EMAIL, isVerified: true }]);
    const { token } = issueSupportToken(ADDRESS, TOKEN_SECRET);

    const body = await (await verify(token)).json();

    expect(mock.getByAddress).toHaveBeenCalledWith(ADDRESS);
    expect(body.verifiedEmail).toBe(EMAIL);
    expect(Buffer.from(token.split('.')[1], 'base64url').toString()).not.toContain(EMAIL);
  });

  it('omits an email that is not verified', async () => {
    mock.getByAddress.mockResolvedValue([{ address: ADDRESS, email: EMAIL, isVerified: false }]);

    const response = await verify(issueSupportToken(ADDRESS, TOKEN_SECRET).token);

    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty('verifiedEmail');
  });

  it('omits the field when the wallet has no subscription', async () => {
    mock.getByAddress.mockResolvedValue([]);

    const response = await verify(issueSupportToken(ADDRESS, TOKEN_SECRET).token);

    expect(await response.json()).not.toHaveProperty('verifiedEmail');
  });

  it('does not read the database for a bad token', async () => {
    const response = await verify('nope');

    expect(response.status).toBe(401);
    expect(mock.getByAddress).not.toHaveBeenCalled();
  });
});
