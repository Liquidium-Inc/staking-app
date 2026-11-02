import { and, eq, lt } from 'drizzle-orm';

import { sql } from './client';
import { stakes, termsAcceptances, unstakes } from './schema';

async function hasAccepted(address: string, version: string) {
  const [record] = await sql
    .select({ version: termsAcceptances.version })
    .from(termsAcceptances)
    .where(and(eq(termsAcceptances.address, address), eq(termsAcceptances.version, version)))
    .limit(1);
  return !!record;
}

async function accept(address: string, version: string) {
  await sql.insert(termsAcceptances).values({ address, version }).onConflictDoNothing();
}

async function usedAppBefore(address: string, date: Date) {
  const [stake] = await sql
    .select({ id: stakes.id })
    .from(stakes)
    .where(and(eq(stakes.address, address), lt(stakes.timestamp, date)))
    .limit(1);
  if (stake) return true;

  const [unstake] = await sql
    .select({ id: unstakes.id })
    .from(unstakes)
    .where(and(eq(unstakes.address, address), lt(unstakes.timestamp, date)))
    .limit(1);
  return !!unstake;
}

export const terms = { hasAccepted, accept, usedAppBefore };
