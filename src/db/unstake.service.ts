import { and, desc, eq, isNull, isNotNull, inArray, lt, or, gte } from 'drizzle-orm';

import { pick } from '@/lib/pick';

import { sql } from './client';
import { unstakes } from './schema';

const PENDING_RESULT_LIMIT = 50;
const MONITOR_BATCH_LIMIT = 100;
const MONITOR_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function insert(...values: (typeof unstakes.$inferInsert)[]) {
  return await sql.insert(unstakes).values(values);
}

async function getPendingsOf(address: string) {
  return await sql
    .select(pick(unstakes, 'txid', 'amount', 'sAmount', 'timestamp', 'claimTx', 'claimTxBlock'))
    .from(unstakes)
    .where(
      and(eq(unstakes.address, address), isNull(unstakes.claimTx), isNull(unstakes.invalidatedAt)),
    )
    .orderBy(desc(unstakes.id))
    .limit(PENDING_RESULT_LIMIT);
}

async function getAfterBlock(block: number) {
  const pendingCutoff = new Date(Date.now() - MONITOR_PENDING_MAX_AGE_MS);
  const isNotSettled = or(
    and(isNull(unstakes.block), gte(unstakes.timestamp, pendingCutoff)),
    gte(unstakes.block, block),
  );
  return await sql
    .select()
    .from(unstakes)
    .where(isNotSettled)
    .orderBy(desc(unstakes.id))
    .limit(MONITOR_BATCH_LIMIT);
}

async function getWithdrawAfterBlock(block: number) {
  const pendingCutoff = new Date(Date.now() - MONITOR_PENDING_MAX_AGE_MS);
  const claimIsNotSettled = and(
    isNotNull(unstakes.claimTx),
    or(
      and(isNull(unstakes.claimTxBlock), gte(unstakes.timestamp, pendingCutoff)),
      gte(unstakes.claimTxBlock, block),
    ),
  );
  return await sql
    .select()
    .from(unstakes)
    .where(claimIsNotSettled)
    .orderBy(desc(unstakes.id))
    .limit(MONITOR_BATCH_LIMIT);
}

async function getWithdrawAfterBlockForAddress(block: number, address: string) {
  const claimIsNotSettled = and(
    eq(unstakes.address, address),
    isNotNull(unstakes.claimTx),
    or(isNull(unstakes.claimTxBlock), gte(unstakes.claimTxBlock, block)),
  );
  return await sql
    .select(
      pick(
        unstakes,
        'id',
        'address',
        'txid',
        'amount',
        'sAmount',
        'timestamp',
        'claimTx',
        'claimTxBlock',
      ),
    )
    .from(unstakes)
    .where(claimIsNotSettled)
    .orderBy(desc(unstakes.id))
    .limit(PENDING_RESULT_LIMIT);
}

async function getByTxid(txid: string) {
  const [value] = await sql.select().from(unstakes).where(eq(unstakes.txid, txid)).limit(1);
  return value;
}

async function update(ids: number[], payload: Partial<typeof unstakes.$inferInsert>) {
  await sql.update(unstakes).set(payload).where(inArray(unstakes.id, ids));
}

async function remove(ids: number[]) {
  await sql.delete(unstakes).where(inArray(unstakes.id, ids));
}

/**
 * Atomically takes the stored canister-signed PSBT for broadcasting. Succeeds for exactly one
 * caller, and only while the signature is newer than `signedAfter`.
 */
async function claimSignedPsbt(id: number, psbt: string, signedAfter: Date) {
  const rows = await sql
    .update(unstakes)
    .set({ psbt: null })
    .where(
      and(
        eq(unstakes.id, id),
        eq(unstakes.psbt, psbt),
        isNull(unstakes.invalidatedAt),
        gte(unstakes.timestamp, signedAfter),
      ),
    )
    .returning({ id: unstakes.id });
  return rows.length > 0;
}

/** Atomically discards a stored canister signature that is older than `signedAfter`. */
async function expireSignedPsbt(id: number, signedAfter: Date) {
  const rows = await sql
    .update(unstakes)
    .set({ psbt: null, invalidatedAt: new Date() })
    .where(
      and(
        eq(unstakes.id, id),
        isNotNull(unstakes.psbt),
        isNull(unstakes.invalidatedAt),
        or(isNull(unstakes.timestamp), lt(unstakes.timestamp, signedAfter)),
      ),
    )
    .returning({ id: unstakes.id });
  return rows.length > 0;
}

/**
 * Stores a fresh canister signature on an existing row for the same tx, but only if the previous
 * signature was invalidated or has expired.
 */
async function refreshSignedPsbt(id: number, psbt: string, signedAfter: Date) {
  await sql
    .update(unstakes)
    .set({ psbt, timestamp: new Date(), invalidatedAt: null })
    .where(
      and(
        eq(unstakes.id, id),
        or(
          isNotNull(unstakes.invalidatedAt),
          and(isNotNull(unstakes.psbt), lt(unstakes.timestamp, signedAfter)),
        ),
      ),
    );
}

export const unstake = {
  insert,
  getPendingsOf,
  update,
  getAfterBlock,
  getWithdrawAfterBlock,
  getWithdrawAfterBlockForAddress,
  getByTxid,
  remove,
  claimSignedPsbt,
  expireSignedPsbt,
  refreshSignedPsbt,
};
