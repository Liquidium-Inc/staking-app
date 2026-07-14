import { and, desc, eq, isNull, inArray, or, gte } from 'drizzle-orm';

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
    .where(and(eq(stakes.address, address), isNull(stakes.block)))
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

export const stake = {
  insert,
  getPendingsOf,
  update,
  getAfterBlock,
  getByTxid,
  remove,
};
