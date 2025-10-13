import { desc, eq, lt, and } from 'drizzle-orm';

import { sql } from './client';
import { emailSubscriptions, emailVerifications } from './schema';

export const EMAIL_TOKEN_PURPOSE = {
  VERIFY: 'verify',
  UNSUBSCRIBE: 'unsubscribe',
} as const;

export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSE)[keyof typeof EMAIL_TOKEN_PURPOSE];

async function insert(address: string, email: string) {
  return await sql
    .insert(emailSubscriptions)
    .values({ address, email })
    .onConflictDoUpdate({
      target: emailSubscriptions.address,
      set: { email, isVerified: false },
    });
}

async function getByAddress(address: string) {
  return await sql.select().from(emailSubscriptions).where(eq(emailSubscriptions.address, address));
}

async function getByEmail(email: string) {
  return await sql.select().from(emailSubscriptions).where(eq(emailSubscriptions.email, email));
}

async function verifyEmail(email: string) {
  return await sql
    .update(emailSubscriptions)
    .set({ isVerified: true })
    .where(eq(emailSubscriptions.email, email));
}

async function unsubscribe(address: string) {
  // Delete from both subscriptions and verifications tables using address
  await sql.delete(emailVerifications).where(eq(emailVerifications.address, address));
  return await sql.delete(emailSubscriptions).where(eq(emailSubscriptions.address, address));
}

async function getActiveVerifiedUsers() {
  return await sql
    .select({
      address: emailSubscriptions.address,
      email: emailSubscriptions.email,
    })
    .from(emailSubscriptions)
    .where(eq(emailSubscriptions.isVerified, true));
}

// Verification tokens
async function insertVerificationToken(
  address: string,
  email: string,
  token: string,
  expiresAt: Date,
  purpose: EmailTokenPurpose,
) {
  return await sql.insert(emailVerifications).values({ address, email, token, expiresAt, purpose });
}

async function getVerificationToken(token: string, purpose: EmailTokenPurpose) {
  const [result] = await sql
    .select()
    .from(emailVerifications)
    .where(and(eq(emailVerifications.token, token), eq(emailVerifications.purpose, purpose)))
    .limit(1);
  return result;
}

async function getLatestTokenForAddress(address: string, purpose: EmailTokenPurpose) {
  const [result] = await sql
    .select()
    .from(emailVerifications)
    .where(and(eq(emailVerifications.address, address), eq(emailVerifications.purpose, purpose)))
    .orderBy(desc(emailVerifications.createdAt))
    .limit(1);

  return result ?? null;
}

async function deleteVerificationToken(token: string) {
  return await sql.delete(emailVerifications).where(eq(emailVerifications.token, token));
}

async function deleteExpiredTokens() {
  return await sql.delete(emailVerifications).where(lt(emailVerifications.expiresAt, new Date()));
}

async function deleteByEmail(email: string) {
  return await sql.delete(emailSubscriptions).where(eq(emailSubscriptions.email, email));
}

export const emailSubscription = {
  insert,
  getByAddress,
  getByEmail,
  verifyEmail,
  unsubscribe,
  getActiveVerifiedUsers,
  insertVerificationToken,
  getVerificationToken,
  getLatestTokenForAddress,
  deleteVerificationToken,
  deleteExpiredTokens,
  deleteByEmail,
};
