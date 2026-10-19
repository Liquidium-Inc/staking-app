import { and, desc, eq, isNull, inArray, or, gte, isNotNull } from 'drizzle-orm';

import { pick } from '@/lib/pick';

import { sql } from './client';
import { MONITOR_PENDING_MAX_AGE_MS } from './constants';
import { unstakes } from './schema';

const PENDING_RESULT_LIMIT = 50;
const MONITOR_BATCH_LIMIT = 100;

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

const SUPPORT_UNSTAKE_COLUMNS = [
  'id',
  'address',
  'txid',
  'amount',
  'sAmount',
  'timestamp',
  'block',
  'claimTx',
  'claimTxBlock',
] as const;

async function getRecentOf(address: string, limit: number) {
  return await sql
    .select(pick(unstakes, ...SUPPORT_UNSTAKE_COLUMNS))
    .from(unstakes)
    .where(eq(unstakes.address, address))
    .orderBy(desc(unstakes.id))
    .limit(limit);
}

/** The address's own unstake with this txid or claim txid. */
async function getOwnByTxid(address: string, txid: string) {
  const [value] = await sql
    .select(pick(unstakes, ...SUPPORT_UNSTAKE_COLUMNS))
    .from(unstakes)
    .where(
      and(eq(unstakes.address, address), or(eq(unstakes.txid, txid), eq(unstakes.claimTx, txid))),
    )
    .orderBy(desc(unstakes.id))
    .limit(1);
  return value;
}

async function getByClaimTx(claimTx: string) {
  const [value] = await sql
    .select(pick(unstakes, ...SUPPORT_UNSTAKE_COLUMNS))
    .from(unstakes)
    .where(eq(unstakes.claimTx, claimTx))
    .limit(1);
  return value;
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
  getRecentOf,
  getOwnByTxid,
  getByClaimTx,
  update,
  getAfterBlock,
  getWithdrawAfterBlock,
  getWithdrawAfterBlockForAddress,
  getByTxid,
  remove,
};
