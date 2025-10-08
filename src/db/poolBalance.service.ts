import { asc } from 'drizzle-orm';

import { sql } from './client';
import { poolBalances } from './schema';

export const insert = async (staked: string, balance: string, block: number) => {
  return await sql.insert(poolBalances).values({ staked, balance, block }).onConflictDoUpdate({
    target: poolBalances.block,
    set: { staked, balance },
  });
};

export const getHistoric = async () => {
  return sql.select().from(poolBalances).orderBy(asc(poolBalances.block));
};

export const poolBalance = {
  insert,
  getHistoric,
};
