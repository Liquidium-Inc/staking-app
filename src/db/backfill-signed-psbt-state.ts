import * as bitcoin from 'bitcoinjs-lib';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { stakes, unstakes } from './schema';

/** A legacy claim this old is already stale, so it is reconciled against the network first. */
const STALE_CLAIM_OFFSET_MS = 60 * 60 * 1000;

/** The unsigned txid of a stored PSBT: the prepare identity, even after a P2SH input finalized. */
function unsignedTxid(psbtBase64: string | null) {
  if (!psbtBase64) return null;
  try {
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64);
    return (psbt.data.globalMap.unsignedTx as unknown as { tx: { getId(): string } }).tx.getId();
  } catch {
    return null;
  }
}

/**
 * Brings unsettled rows written by code from before the signed-PSBT state columns into that state.
 * Old code kept the canister-signed PSBT after broadcasting and overwrote txid with the network
 * txid, so such a row may or may not be on the network:
 * - prepareTxid comes from the stored PSBT's unsigned tx (falls back to txid without a PSBT);
 *   only the newest row per identity gets it
 * - the row becomes an already-stale claim, so it is monitored and reconciled by txid
 * - the stored PSBT is retired
 * Idempotent: it only touches unsettled rows that have neither prepareTxid nor claimedAt.
 */
export async function backfillSignedPsbtState<TSchema extends Record<string, unknown>>(
  db: PgDatabase<PgQueryResultHKT, TSchema>,
) {
  const summary: Record<string, { updated: number; duplicates: number }> = {};
  for (const [name, t] of [
    ['stakes', stakes],
    ['unstakes', unstakes as unknown as typeof stakes],
  ] as const) {
    const rows = await db
      .select({ id: t.id, txid: t.txid, psbt: t.psbt, timestamp: t.timestamp })
      .from(t)
      .where(and(isNull(t.block), isNull(t.prepareTxid), isNull(t.claimedAt)))
      .orderBy(desc(t.id));

    let duplicates = 0;
    for (const row of rows) {
      const identity = unsignedTxid(row.psbt) ?? row.txid;
      const [taken] = await db
        .select({ id: t.id })
        .from(t)
        .where(eq(t.prepareTxid, identity))
        .limit(1);
      if (taken) duplicates++;
      await db
        .update(t)
        .set({
          prepareTxid: taken ? null : identity,
          claimedAt: new Date(row.timestamp.getTime() - STALE_CLAIM_OFFSET_MS),
          psbt: null,
        })
        .where(eq(t.id, row.id));
    }
    summary[name] = { updated: rows.length, duplicates };
  }
  return summary;
}
