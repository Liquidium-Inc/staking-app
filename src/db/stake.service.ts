import { and, eq, isNull, inArray, or, gte } from 'drizzle-orm';

import { pick } from '@/lib/pick';

import { sql } from './client';
import { stakes } from './schema';

async function insert(...values: (typeof stakes.$inferInsert)[]) {
  return await sql.insert(stakes).values(values);
}

async function getPendingsOf(address: string) {
  return await sql
    .select(pick(stakes, 'txid', 'amount', 'sAmount', 'timestamp'))
    .from(stakes)
    .where(and(eq(stakes.address, address), isNull(stakes.block)));
}

async function getAfterBlock(block: number) {
  const isNotSettled = or(isNull(stakes.block), gte(stakes.block, block));
  return await sql.select().from(stakes).where(isNotSettled);
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
