import { and, eq, isNull, inArray, or, gte, isNotNull } from 'drizzle-orm';

import { pick } from '@/lib/pick';

import { sql } from './client';
import { unstakes } from './schema';

async function insert(...values: (typeof unstakes.$inferInsert)[]) {
  return await sql.insert(unstakes).values(values);
}

async function getPendingsOf(address: string) {
  return await sql
    .select(pick(unstakes, 'txid', 'amount', 'sAmount', 'timestamp', 'claimTx', 'claimTxBlock'))
    .from(unstakes)
    .where(and(eq(unstakes.address, address), isNull(unstakes.claimTx)));
}

async function getAfterBlock(block: number) {
  const isNotSettled = or(isNull(unstakes.block), gte(unstakes.block, block));
  return await sql.select().from(unstakes).where(isNotSettled);
}

async function getWithdrawAfterBlock(block: number) {
  const claimIsNotSettled = and(
    isNotNull(unstakes.claimTx),
    or(isNull(unstakes.claimTxBlock), gte(unstakes.claimTxBlock, block)),
  );
  return await sql.select().from(unstakes).where(claimIsNotSettled);
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

export const unstake = {
  insert,
  getPendingsOf,
  update,
  getAfterBlock,
  getWithdrawAfterBlock,
  getByTxid,
  remove,
};
