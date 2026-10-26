import { and, desc, eq, isNull, isNotNull, inArray, lt, or, gte } from 'drizzle-orm';

import { pick } from '@/lib/pick';

import { sql } from './client';
import { stakes } from './schema';

const PENDING_RESULT_LIMIT = 50;
const MONITOR_BATCH_LIMIT = 100;
const MONITOR_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function insert(...values: (typeof stakes.$inferInsert)[]) {
  return await sql.insert(stakes).values(values);
}

async function getPendingsOf(address: string) {
  return await sql
    .select(pick(stakes, 'txid', 'amount', 'sAmount', 'timestamp'))
    .from(stakes)
    .where(and(eq(stakes.address, address), isNull(stakes.block), isNull(stakes.invalidatedAt)))
    .orderBy(desc(stakes.id))
    .limit(PENDING_RESULT_LIMIT);
}

async function getAfterBlock(block: number) {
  const pendingCutoff = new Date(Date.now() - MONITOR_PENDING_MAX_AGE_MS);
  const isNotSettled = or(
    and(isNull(stakes.block), gte(stakes.timestamp, pendingCutoff)),
    gte(stakes.block, block),
  );
  return await sql
    .select()
    .from(stakes)
    .where(isNotSettled)
    .orderBy(desc(stakes.id))
    .limit(MONITOR_BATCH_LIMIT);
}

async function update(ids: number[], payload: Partial<typeof stakes.$inferInsert>) {
  await sql.update(stakes).set(payload).where(inArray(stakes.id, ids));
}

async function getByTxid(txid: string) {
  const [value] = await sql.select().from(stakes).where(eq(stakes.txid, txid)).limit(1);
  return value;
}

async function remove(ids: number[]) {
  await sql.delete(stakes).where(inArray(stakes.id, ids));
}

/**
 * Atomically takes the stored canister-signed PSBT for broadcasting. Succeeds for exactly one
 * caller, and only while the signature is newer than `signedAfter`.
 */
async function claimSignedPsbt(id: number, psbt: string, signedAfter: Date) {
  const rows = await sql
    .update(stakes)
    .set({ psbt: null })
    .where(
      and(
        eq(stakes.id, id),
        eq(stakes.psbt, psbt),
        isNull(stakes.invalidatedAt),
        gte(stakes.timestamp, signedAfter),
      ),
    )
    .returning({ id: stakes.id });
  return rows.length > 0;
}

/** Atomically discards a stored canister signature that is older than `signedAfter`. */
async function expireSignedPsbt(id: number, signedAfter: Date) {
  const rows = await sql
    .update(stakes)
    .set({ psbt: null, invalidatedAt: new Date() })
    .where(
      and(
        eq(stakes.id, id),
        isNotNull(stakes.psbt),
        isNull(stakes.invalidatedAt),
        or(isNull(stakes.timestamp), lt(stakes.timestamp, signedAfter)),
      ),
    )
    .returning({ id: stakes.id });
  return rows.length > 0;
}

/**
 * Stores a fresh canister signature on an existing row for the same tx, but only if the previous
 * signature was invalidated or has expired.
 */
async function refreshSignedPsbt(id: number, psbt: string, signedAfter: Date) {
  await sql
    .update(stakes)
    .set({ psbt, timestamp: new Date(), invalidatedAt: null })
    .where(
      and(
        eq(stakes.id, id),
        or(
          isNotNull(stakes.invalidatedAt),
          and(isNotNull(stakes.psbt), lt(stakes.timestamp, signedAfter)),
        ),
      ),
    );
}

export const stake = {
  insert,
  getPendingsOf,
  update,
  getAfterBlock,
  getByTxid,
  remove,
  claimSignedPsbt,
  expireSignedPsbt,
  refreshSignedPsbt,
};
