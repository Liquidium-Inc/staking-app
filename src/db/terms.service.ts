import { and, type AnyColumn, eq, lt, sql as rawSql } from 'drizzle-orm';

import { sql } from './client';
import { emailSubscriptions, stakes, termsAcceptances, unstakes } from './schema';

// Bech32 addresses are case-insensitive, Base58 ones aren't.
function normalize(address: string) {
  const trimmed = address.trim();
  return /^(bc|tb)1/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

const matches = (column: AnyColumn, address: string) =>
  eq(rawSql`lower(${column})`, address.trim().toLowerCase());

async function hasAccepted(address: string, version: string) {
  const [record] = await sql
    .select({ version: termsAcceptances.version })
    .from(termsAcceptances)
    .where(
      and(eq(termsAcceptances.address, normalize(address)), eq(termsAcceptances.version, version)),
    )
    .limit(1);
  return !!record;
}

async function accept(address: string, version: string) {
  await sql
    .insert(termsAcceptances)
    .values({ address: normalize(address), version })
    .onConflictDoNothing();
}

async function usedAppBefore(address: string, date: Date) {
  const [stake] = await sql
    .select({ id: stakes.id })
    .from(stakes)
    .where(and(matches(stakes.address, address), lt(stakes.timestamp, date)))
    .limit(1);
  if (stake) return true;

  const [unstake] = await sql
    .select({ id: unstakes.id })
    .from(unstakes)
    .where(and(matches(unstakes.address, address), lt(unstakes.timestamp, date)))
    .limit(1);
  if (unstake) return true;

  const [subscription] = await sql
    .select({ id: emailSubscriptions.id })
    .from(emailSubscriptions)
    .where(
      and(matches(emailSubscriptions.address, address), lt(emailSubscriptions.createdAt, date)),
    )
    .limit(1);
  return !!subscription;
}

export const terms = { hasAccepted, accept, usedAppBefore };
