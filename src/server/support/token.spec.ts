import { createHmac } from 'crypto';

import { describe, expect, it } from 'vitest';

import { SUPPORT_TOKEN_AUDIENCE, SUPPORT_TOKEN_TTL_MS } from './constants';
import { isUsableTokenSecret, issueSupportToken, verifySupportToken } from './token';

const SECRET = 'a'.repeat(32);
const OTHER_SECRET = 'b'.repeat(32);
const ADDRESS = 'bc1pexampleaddress';
const NOW_MS = 1_760_000_000_000;

function forge(header: object, claims: object, secret: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(claims)}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

describe('support token', () => {
  it('round-trips the session address as the only verified address', () => {
    const { token, expiresAt } = issueSupportToken(ADDRESS, SECRET, NOW_MS);

    const verified = verifySupportToken(token, SECRET, NOW_MS);

    expect(expiresAt).toBe(NOW_MS + SUPPORT_TOKEN_TTL_MS);
    expect(verified).toMatchObject({
      subject: ADDRESS,
      addresses: [{ address: ADDRESS, kind: 'ordinals', chain: 'bitcoin' }],
      expiresAt,
    });
    expect(verified?.tokenId).toEqual(expect.any(String));
  });

  it('sets the liquidium-support audience and a 15 minute expiry', () => {
    const { token } = issueSupportToken(ADDRESS, SECRET, NOW_MS);
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

    expect(claims.aud).toBe(SUPPORT_TOKEN_AUDIENCE);
    expect((claims.exp - claims.iat) * 1000).toBe(SUPPORT_TOKEN_TTL_MS);
  });

  it('rejects a token signed with another secret', () => {
    const { token } = issueSupportToken(ADDRESS, OTHER_SECRET, NOW_MS);
    expect(verifySupportToken(token, SECRET, NOW_MS)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const { token } = issueSupportToken(ADDRESS, SECRET, NOW_MS);
    const [header, originalPayload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(originalPayload, 'base64url').toString());
    const payload = Buffer.from(
      JSON.stringify({
        ...claims,
        sub: 'attacker',
        addrs: [{ address: 'attacker', kind: 'ordinals', chain: 'bitcoin' }],
      }),
    ).toString('base64url');

    expect(verifySupportToken(`${header}.${payload}.${signature}`, SECRET, NOW_MS)).toBeNull();
  });

  it('rejects an expired token', () => {
    const { token } = issueSupportToken(ADDRESS, SECRET, NOW_MS);
    expect(verifySupportToken(token, SECRET, NOW_MS + SUPPORT_TOKEN_TTL_MS)).toBeNull();
  });

  it('rejects another audience and the none algorithm', () => {
    const claims = {
      sub: ADDRESS,
      addrs: [{ address: ADDRESS, kind: 'ordinals', chain: 'bitcoin' }],
      jti: 'id',
      iat: Math.floor(NOW_MS / 1000),
      exp: Math.floor(NOW_MS / 1000) + 60,
    };
    const wrongAudience = forge({ alg: 'HS256', typ: 'JWT' }, { ...claims, aud: 'x' }, SECRET);
    const noneAlgorithm = forge(
      { alg: 'none', typ: 'JWT' },
      { ...claims, aud: SUPPORT_TOKEN_AUDIENCE },
      SECRET,
    );

    expect(verifySupportToken(wrongAudience, SECRET, NOW_MS)).toBeNull();
    expect(verifySupportToken(noneAlgorithm, SECRET, NOW_MS)).toBeNull();
    expect(verifySupportToken('not.a.jwt', SECRET, NOW_MS)).toBeNull();
  });

  it('treats short or missing secrets as unusable', () => {
    expect(isUsableTokenSecret(undefined)).toBe(false);
    expect(isUsableTokenSecret('short')).toBe(false);
    expect(isUsableTokenSecret(SECRET)).toBe(true);
  });
});
