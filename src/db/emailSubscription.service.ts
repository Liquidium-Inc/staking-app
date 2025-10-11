import { desc, eq, lt } from 'drizzle-orm';

import { sql } from './client';
import { emailSubscriptions, emailVerifications } from './schema';

async function insert(address: string, email: string) {
  return await sql
    .insert(emailSubscriptions)
    .values({ address, email })
    .onConflictDoUpdate({
      target: [emailSubscriptions.address, emailSubscriptions.email],
      set: {
        email,
      },
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
) {
  return await sql.insert(emailVerifications).values({ address, email, token, expiresAt });
}

async function getVerificationToken(token: string) {
  const [result] = await sql
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.token, token))
    .limit(1);
  return result;
}

async function getLatestTokenForAddress(address: string) {
  const [result] = await sql
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.address, address))
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
