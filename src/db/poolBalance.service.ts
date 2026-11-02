import { desc, lt, sql as drizzleSql } from 'drizzle-orm';

import { sql } from './client';
import { poolBalances } from './schema';

const MAX_HISTORIC_BLOCKS = 30 * 24 * 6;
const poolBalanceDay = drizzleSql`date_trunc('day', ${poolBalances.timestamp})`;

export const insert = async (staked: string, balance: string, block: number) => {
  return await sql.insert(poolBalances).values({ staked, balance, block }).onConflictDoUpdate({
    target: poolBalances.block,
    set: { staked, balance },
  });
};

/**
 * Returns every row from the recent window plus one row per day before it, so earnings can price
 * old stakes without returning the full per-block history.
 */
export const getHistoric = async () => {
  const recent = await sql
    .select()
    .from(poolBalances)
    .orderBy(desc(poolBalances.block))
    .limit(MAX_HISTORIC_BLOCKS);
  recent.reverse();
  if (recent.length < MAX_HISTORIC_BLOCKS) return recent;

  const daily = await sql
    .selectDistinctOn([poolBalanceDay])
    .from(poolBalances)
    .where(lt(poolBalances.block, recent[0].block))
    .orderBy(poolBalanceDay, desc(poolBalances.block));
  return [...daily, ...recent];
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
