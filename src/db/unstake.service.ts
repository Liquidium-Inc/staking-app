import { and, desc, eq, isNull, inArray, or, gte, isNotNull } from 'drizzle-orm';

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
    .where(and(eq(unstakes.address, address), isNull(unstakes.claimTx)))
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

export const unstake = {
  insert,
  getPendingsOf,
  update,
  getAfterBlock,
  getWithdrawAfterBlock,
  getWithdrawAfterBlockForAddress,
  getByTxid,
  remove,
};
