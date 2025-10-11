import { createHash, randomBytes } from 'crypto';

import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

import { db } from '@/db';

const SESSION_COOKIE_NAME = 'wallet_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return randomBytes(32).toString('hex');
}

async function storeSession(address: string) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.walletAuth.sessions.deleteExpired(now);
  await db.walletAuth.sessions.create({
    address,
    tokenHash,
    expiresAt,
    lastActiveAt: now,
  });

  return { token, expiresAt };
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();

  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
  });
}

export async function createSession(address: string) {
  const { token, expiresAt } = await storeSession(address);
  await setSessionCookie(token, expiresAt);

  return { expiresAt };
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export async function getSessionFromRequest(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await db.walletAuth.sessions.findByTokenHash(tokenHash);
  if (!session) return null;

  const now = new Date();
  if (session.expiresAt <= now) {
    await db.walletAuth.sessions.deleteById(session.id);
    return null;
  }

  const newExpiry = new Date(now.getTime() + SESSION_TTL_MS);
  await db.walletAuth.sessions.touch(session.id, now, newExpiry);
  await setSessionCookie(token, newExpiry);
  return {
    ...session,
    lastActiveAt: now,
    expiresAt: newExpiry,
  };
}

export async function requireSession(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) throw new UnauthorizedError();
  return session;
}

export const sessionCookieName = SESSION_COOKIE_NAME;
