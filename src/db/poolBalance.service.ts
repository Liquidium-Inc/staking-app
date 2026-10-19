import { desc } from 'drizzle-orm';

import { sql } from './client';
import { poolBalances } from './schema';

const MAX_HISTORIC_BLOCKS = 30 * 24 * 6;

export const insert = async (staked: string, balance: string, block: number) => {
  return await sql.insert(poolBalances).values({ staked, balance, block }).onConflictDoUpdate({
    target: poolBalances.block,
    set: { staked, balance },
  });
};

export const getHistoric = async () => {
  const rows = await sql
    .select()
    .from(poolBalances)
    .orderBy(desc(poolBalances.block))
    .limit(MAX_HISTORIC_BLOCKS);
  return rows.reverse();
};

export const getLatest = async () => {
  const [row] = await sql
    .select({ block: poolBalances.block, timestamp: poolBalances.timestamp })
    .from(poolBalances)
    .orderBy(desc(poolBalances.block))
    .limit(1);
  return row ?? null;
};

export const poolBalance = {
  insert,
  getHistoric,
  getLatest,
};
