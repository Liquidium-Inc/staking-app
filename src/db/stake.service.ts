import { and, desc, eq, isNull, inArray } from 'drizzle-orm';

import { pick } from '@/lib/pick';

import { sql } from './client';
import { stakes } from './schema';
import { signedPsbtQueries } from './signed-psbt';

const PENDING_RESULT_LIMIT = 50;

async function insert(...values: (typeof stakes.$inferInsert)[]) {
  return await sql.insert(stakes).values(values);
}

async function getPendingsOf(address: string) {
  return await sql
    .select(pick(stakes, 'txid', 'amount', 'sAmount', 'timestamp'))
    .from(stakes)
    .where(
      and(
        eq(stakes.address, address),
        isNull(stakes.block),
        isNull(stakes.invalidatedAt),
        isNull(stakes.supersededAt),
      ),
    )
    .orderBy(desc(stakes.id))
    .limit(PENDING_RESULT_LIMIT);
}

const SUPPORT_STAKE_COLUMNS = ['id', 'txid', 'amount', 'sAmount', 'timestamp', 'block'] as const;

async function getRecentOf(address: string, limit: number) {
  return await sql
    .select(pick(stakes, ...SUPPORT_STAKE_COLUMNS))
    .from(stakes)
    .where(eq(stakes.address, address))
    .orderBy(desc(stakes.id))
    .limit(limit);
}

/** The address's own stake with this txid. */
async function getOwnByTxid(address: string, txid: string) {
  const [value] = await sql
    .select(pick(stakes, ...SUPPORT_STAKE_COLUMNS))
    .from(stakes)
    .where(and(eq(stakes.address, address), eq(stakes.txid, txid)))
    .orderBy(desc(stakes.id))
    .limit(1);
  return value;
}

async function update(ids: number[], payload: Partial<typeof stakes.$inferInsert>) {
  await sql.update(stakes).set(payload).where(inArray(stakes.id, ids));
}

async function getByTxid(txid: string) {
  // Backfill-superseded duplicates share the network txid; only the canonical row counts
  const [value] = await sql
    .select()
    .from(stakes)
    .where(and(eq(stakes.txid, txid), isNull(stakes.supersededAt)))
    .limit(1);
  return value;
}

async function remove(ids: number[]) {
  await sql.delete(stakes).where(inArray(stakes.id, ids));
}

export const stake = {
  insert,
  getPendingsOf,
  getRecentOf,
  getOwnByTxid,
  update,
  getByTxid,
  remove,
  ...signedPsbtQueries(stakes),
};
