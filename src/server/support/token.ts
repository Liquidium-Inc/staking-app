import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

import { z } from 'zod';

import {
  SUPPORT_CHAIN,
  SUPPORT_TOKEN_AUDIENCE,
  SUPPORT_TOKEN_SECRET_MIN_BYTES,
  SUPPORT_TOKEN_TTL_MS,
  SupportAddressKind,
} from './constants';

const JWT_HEADER = { alg: 'HS256', typ: 'JWT' } as const;
const MS_PER_SECOND = 1000;

const supportAddressSchema = z.object({
  address: z.string().min(1),
  kind: z.string().min(1),
  chain: z.string().min(1),
});

const headerSchema = z.object({ alg: z.literal(JWT_HEADER.alg), typ: z.literal(JWT_HEADER.typ) });

const claimsSchema = z.object({
  sub: z.string().min(1),
  addrs: z.array(supportAddressSchema).min(1),
  jti: z.string().min(1),
  iat: z.number().int(),
  exp: z.number().int(),
  aud: z.literal(SUPPORT_TOKEN_AUDIENCE),
});

export type SupportAddress = z.infer<typeof supportAddressSchema>;

export type VerifiedSupportToken = {
  subject: string;
  addresses: SupportAddress[];
  tokenId: string;
  expiresAt: number;
};

function base64UrlJson(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(input: string, secret: string) {
  return createHmac('sha256', secret).update(input).digest();
}

export function isUsableTokenSecret(secret: string | undefined): secret is string {
  return !!secret && Buffer.byteLength(secret) >= SUPPORT_TOKEN_SECRET_MIN_BYTES;
}

/** Mints a support token for the address proven by the wallet session. */
export function issueSupportToken(address: string, secret: string, nowMs = Date.now()) {
  const expiresAt = nowMs + SUPPORT_TOKEN_TTL_MS;
  const claims: z.infer<typeof claimsSchema> = {
    sub: address,
    addrs: [{ address, kind: SupportAddressKind.Ordinals, chain: SUPPORT_CHAIN }],
    jti: randomUUID(),
    iat: Math.floor(nowMs / MS_PER_SECOND),
    exp: Math.floor(expiresAt / MS_PER_SECOND),
    aud: SUPPORT_TOKEN_AUDIENCE,
  };
  const unsigned = `${base64UrlJson(JWT_HEADER)}.${base64UrlJson(claims)}`;
  const token = `${unsigned}.${sign(unsigned, secret).toString('base64url')}`;

  return { token, expiresAt: claims.exp * MS_PER_SECOND };
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Returns the verified claims, or null for any invalid, expired or foreign token. */
export function verifySupportToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): VerifiedSupportToken | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  const [header, payload, signature] = segments;

  const expected = sign(`${header}.${payload}`, secret);
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  if (!headerSchema.safeParse(decodeJson(header)).success) return null;
  const claims = claimsSchema.safeParse(decodeJson(payload));
  if (!claims.success) return null;
  if (claims.data.exp * MS_PER_SECOND <= nowMs) return null;

  return {
    subject: claims.data.sub,
    addresses: claims.data.addrs,
    tokenId: claims.data.jti,
    expiresAt: claims.data.exp * MS_PER_SECOND,
  };
}
