import { eq, lt } from 'drizzle-orm';

import { sql } from './client';
import { walletAuthNonces, walletSessions } from './schema';

type NonceInsert = typeof walletAuthNonces.$inferInsert;
type SessionInsert = typeof walletSessions.$inferInsert;

async function createNonce(values: NonceInsert) {
  await sql.insert(walletAuthNonces).values(values);
}

async function findNonceByValue(nonce: string) {
  const [record] = await sql
    .select()
    .from(walletAuthNonces)
    .where(eq(walletAuthNonces.nonce, nonce))
    .limit(1);
  return record ?? null;
}

async function deleteNonceById(id: number) {
  await sql.delete(walletAuthNonces).where(eq(walletAuthNonces.id, id));
}

async function consumeNonceByValue(nonce: string) {
  const [record] = await sql
    .delete(walletAuthNonces)
    .where(eq(walletAuthNonces.nonce, nonce))
    .returning();

  return record ?? null;
}

async function deleteExpiredNonces(now: Date) {
  await sql.delete(walletAuthNonces).where(lt(walletAuthNonces.expiresAt, now));
}

async function createSession(values: SessionInsert) {
  await sql
    .insert(walletSessions)
    .values(values)
    .onConflictDoUpdate({
      target: walletSessions.address,
      set: {
        tokenHash: values.tokenHash,
        expiresAt: values.expiresAt,
        lastActiveAt: values.lastActiveAt,
      },
    });
}

async function deleteSessionsByAddress(address: string) {
  await sql.delete(walletSessions).where(eq(walletSessions.address, address));
}

async function findSessionByTokenHash(hash: string) {
  const [record] = await sql
    .select()
    .from(walletSessions)
    .where(eq(walletSessions.tokenHash, hash))
    .limit(1);
  return record ?? null;
}

async function deleteExpiredSessions(now: Date) {
  await sql.delete(walletSessions).where(lt(walletSessions.expiresAt, now));
}

async function deleteSessionById(id: number) {
  await sql.delete(walletSessions).where(eq(walletSessions.id, id));
}

async function touchSession(id: number, lastActiveAt: Date, expiresAt: Date) {
  await sql
    .update(walletSessions)
    .set({ lastActiveAt, expiresAt })
    .where(eq(walletSessions.id, id));
}

export const walletAuth = {
  nonces: {
    create: createNonce,
    findByValue: findNonceByValue,
    consumeByValue: consumeNonceByValue,
    deleteById: deleteNonceById,
    deleteExpired: deleteExpiredNonces,
  },
  sessions: {
    create: createSession,
    deleteByAddress: deleteSessionsByAddress,
    findByTokenHash: findSessionByTokenHash,
    deleteById: deleteSessionById,
    deleteExpired: deleteExpiredSessions,
    touch: touchSession,
  },
};
