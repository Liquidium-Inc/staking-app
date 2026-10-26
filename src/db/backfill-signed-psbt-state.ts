import * as bitcoin from 'bitcoinjs-lib';
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { stakes, unstakes } from './schema';

/** A legacy claim this old is already stale, so it is reconciled against the network first. */
const STALE_CLAIM_OFFSET_MS = 60 * 60 * 1000;

const staleClaim = (timestamp: Date) => new Date(timestamp.getTime() - STALE_CLAIM_OFFSET_MS);

/** The unsigned txid of a stored PSBT: the prepare identity, even after a P2SH input finalized. */
function unsignedTxid(psbtBase64: string) {
  try {
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64);
    return (psbt.data.globalMap.unsignedTx as unknown as { tx: { getId(): string } }).tx.getId();
  } catch {
    return null;
  }
}

type Summary = {
  updated: number;
  superseded: number;
  /** Unreadable PSBT, or rows of a group with conflicting network txids: repair by hand. */
  skipped: number[];
  rollback: number;
};

/**
 * Brings unsettled rows written by code from before the signed-PSBT state columns into that state.
 * Old code kept the canister-signed PSBT after broadcasting and overwrote txid with the network
 * txid (which differs from the unsigned txid for P2SH payers), so such a row may be on the network.
 *
 * Rows are grouped by identity: the unsigned txid of the stored PSBT, or txid without a PSBT.
 * Per group, one canonical row carries the group's network state: the row whose txid shows it was
 * broadcast if there is one, otherwise the newest. It gets prepareTxid and becomes an already-stale
 * claim with its PSBT retired, so the monitor reconciles it by txid. If a row already holds the
 * identity, it stays canonical and takes over a broadcast txid. Every other row in the group is
 * superseded: PSBT retired, invalidated, and left out of the monitor and pending lists, so a
 * duplicate can never settle a second time; a withdrawal claim it carries moves to the canonical
 * row. Rows are kept for history.
 *
 * Rows with an unreadable PSBT, and groups whose rows carry more than one network txid, are skipped
 * untouched and reported for manual repair. Superseded rows get supersededAt, so txid lookups
 * ignore them. Refuses to run without `since` if rows show the old build ran after a rollback.
 *
 * With `since` (after a rollback to the old build): unsettled rows that already have prepareTxid
 * but no claim and were prepared since then may have been confirmed by the old code, which never
 * records a claim. They become stale claims with their PSBT retired, keeping prepareTxid.
 *
 * Idempotent.
 */
export async function backfillSignedPsbtState<TSchema extends Record<string, unknown>>(
  db: PgDatabase<PgQueryResultHKT, TSchema>,
  options: { since?: Date } = {},
) {
  const summary: Record<string, Summary> = {};
  for (const [name, t] of [
    ['stakes', stakes],
    ['unstakes', unstakes as unknown as typeof stakes],
  ] as const) {
    const result: Summary = { updated: 0, superseded: 0, skipped: [], rollback: 0 };
    summary[name] = result;

    // Only old code (after a rollback) leaves an unclaimed row whose txid moved off its identity
    if (!options.since) {
      const [rolledBack] = await db
        .select({ id: t.id })
        .from(t)
        .where(
          and(
            isNull(t.block),
            isNotNull(t.prepareTxid),
            isNull(t.claimedAt),
            ne(t.txid, t.prepareTxid),
          ),
        )
        .limit(1);
      if (rolledBack) {
        throw new Error(
          `${name} row ${rolledBack.id} was confirmed by the old build after a rollback; run with --since <time the new build first went live>`,
        );
      }
    }

    if (options.since) {
      const rows = await db
        .update(t)
        .set({ psbt: null, claimedAt: staleClaim(options.since) })
        .where(
          and(
            isNull(t.block),
            isNotNull(t.prepareTxid),
            isNull(t.claimedAt),
            gte(t.timestamp, options.since),
          ),
        )
        .returning({ id: t.id });
      result.rollback = rows.length;
    }

    const candidates = await db
      .select({ id: t.id, txid: t.txid, psbt: t.psbt, timestamp: t.timestamp })
      .from(t)
      .where(
        and(isNull(t.block), isNull(t.prepareTxid), isNull(t.claimedAt), isNull(t.invalidatedAt)),
      )
      .orderBy(desc(t.id));

    const groups = new Map<string, typeof candidates>();
    for (const row of candidates) {
      const identity = row.psbt ? unsignedTxid(row.psbt) : row.txid;
      if (!identity) {
        result.skipped.push(row.id);
        continue;
      }
      groups.set(identity, [...(groups.get(identity) ?? []), row]);
    }

    for (const [identity, rows] of groups) {
      const [holder] = await db
        .select({
          id: t.id,
          txid: t.txid,
          claimedAt: t.claimedAt,
          invalidatedAt: t.invalidatedAt,
          timestamp: t.timestamp,
        })
        .from(t)
        .where(eq(t.prepareTxid, identity))
        .limit(1);

      // The same unsigned tx can only have one network txid; anything else needs a human
      const networkTxids = new Set(
        [...rows.map((row) => row.txid), ...(holder ? [holder.txid] : [])].filter(
          (txid) => txid !== identity,
        ),
      );
      if (networkTxids.size > 1) {
        result.skipped.push(...rows.map((row) => row.id));
        continue;
      }
      const broadcast = rows.find((row) => row.txid !== identity);

      let superseded = rows;
      let canonicalId: number;
      if (holder) {
        canonicalId = holder.id;
        if (broadcast && (holder.txid === identity || holder.invalidatedAt)) {
          await db
            .update(t)
            .set({
              txid: broadcast.txid,
              psbt: null,
              invalidatedAt: null,
              broadcastAt: broadcast.timestamp,
              claimedAt: holder.claimedAt ?? staleClaim(holder.timestamp),
            })
            .where(eq(t.id, holder.id));
        }
      } else {
        const canonical = broadcast ?? rows[0];
        canonicalId = canonical.id;
        await db
          .update(t)
          .set({
            prepareTxid: identity,
            claimedAt: staleClaim(canonical.timestamp),
            psbt: null,
            // A txid that moved off the identity proves the old code broadcast it
            broadcastAt: canonical === broadcast ? canonical.timestamp : null,
          })
          .where(eq(t.id, canonical.id));
        result.updated++;
        superseded = rows.filter((row) => row !== canonical);
      }

      for (const row of superseded) {
        await db
          .update(t)
          .set({ psbt: null, invalidatedAt: new Date(), supersededAt: new Date() })
          .where(eq(t.id, row.id));
        result.superseded++;
      }

      // A duplicate may carry the withdrawal; it belongs on the canonical row
      if (name === 'unstakes' && superseded.length > 0) {
        const [withdrawal] = await db
          .select({ claimTx: unstakes.claimTx, claimTxBlock: unstakes.claimTxBlock })
          .from(unstakes)
          .where(
            and(
              inArray(
                unstakes.id,
                superseded.map((row) => row.id),
              ),
              isNotNull(unstakes.claimTx),
            ),
          )
          .orderBy(desc(unstakes.id))
          .limit(1);
        if (withdrawal) {
          await db
            .update(unstakes)
            .set(withdrawal)
            .where(and(eq(unstakes.id, canonicalId), isNull(unstakes.claimTx)));
        }
      }
    }
  }
  return summary;
}
