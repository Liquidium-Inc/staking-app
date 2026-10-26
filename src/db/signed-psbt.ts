import { and, desc, eq, gte, isNotNull, isNull, lt, or } from 'drizzle-orm';

import { sql } from './client';
import { stakes, unstakes } from './schema';

const MONITOR_BATCH_LIMIT = 100;
const MONITOR_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Lifecycle of the canister-signed PSBT stored on a stake/unstake row. Every transition is a
 * single conditional UPDATE, so concurrent requests can't both win, and none of them touch a row
 * whose tx is confirmed (`block` set).
 *
 *   signed (psbt, timestamp) --claim--> claimed (claimedAt) --record network txid--> broadcast
 *        |                                  |  broadcast failed and tx unknown, or claim stale
 *        v expire                           v  and tx unknown
 *   invalidated (invalidatedAt) <-----------+          invalidated/expired/stale --refresh--> signed
 *
 * `prepareTxid` (unsigned txid) identifies the row and never changes. `txid` is the network txid,
 * written right before the tx is handed to the network.
 */
export function signedPsbtQueries(table: typeof stakes | typeof unstakes) {
  // Both tables share these columns; drizzle can't build queries over a table union.
  const t = table as typeof stakes;
  const notConfirmed = isNull(t.block);

  async function getByPrepareTxid(prepareTxid: string) {
    const [value] = await sql.select().from(t).where(eq(t.prepareTxid, prepareTxid)).limit(1);
    return value;
  }

  /**
   * Rows the monitor must check: unsettled rows that were handed to (or may be on) the network,
   * and recently settled ones. Pages by descending id; pass the last id seen as `beforeId`.
   */
  async function getMonitorBatch(settledAfterBlock: number, beforeId?: number) {
    const pendingCutoff = new Date(Date.now() - MONITOR_PENDING_MAX_AGE_MS);
    return await sql
      .select()
      .from(t)
      .where(
        and(
          beforeId === undefined ? undefined : lt(t.id, beforeId),
          or(
            and(notConfirmed, isNotNull(t.claimedAt), gte(t.timestamp, pendingCutoff)),
            gte(t.block, settledAfterBlock),
          ),
        ),
      )
      .orderBy(desc(t.id))
      .limit(MONITOR_BATCH_LIMIT);
  }

  /** Takes the stored PSBT for broadcasting. Returns the claim time, or null if not claimable. */
  async function claimSignedPsbt(id: number, psbt: string, signedAfter: Date) {
    const claimedAt = new Date();
    const rows = await sql
      .update(t)
      .set({ psbt: null, claimedAt })
      .where(
        and(
          eq(t.id, id),
          eq(t.psbt, psbt),
          isNull(t.invalidatedAt),
          notConfirmed,
          gte(t.timestamp, signedAfter),
        ),
      )
      .returning({ id: t.id });
    return rows.length > 0 ? claimedAt : null;
  }

  /** Records the finalized tx's txid for the given claim. Must happen before broadcasting. */
  async function recordBroadcastTxid(id: number, claimedAt: Date, txid: string) {
    const rows = await sql
      .update(t)
      .set({ txid })
      .where(and(eq(t.id, id), eq(t.claimedAt, claimedAt), notConfirmed))
      .returning({ id: t.id });
    return rows.length > 0;
  }

  /** Discards a stored, unclaimed signature that is older than `signedAfter`. */
  async function expireSignedPsbt(id: number, signedAfter: Date) {
    const rows = await sql
      .update(t)
      .set({ psbt: null, invalidatedAt: new Date() })
      .where(
        and(
          eq(t.id, id),
          isNotNull(t.psbt),
          isNull(t.invalidatedAt),
          notConfirmed,
          or(isNull(t.timestamp), lt(t.timestamp, signedAfter)),
        ),
      )
      .returning({ id: t.id });
    return rows.length > 0;
  }

  /**
   * Marks a claim as dead, only if the row is still in the state that claim left it in. Callers
   * must first make sure the tx is not in the mempool or on-chain.
   */
  async function invalidateClaim(id: number, claimedAt: Date) {
    const rows = await sql
      .update(t)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          eq(t.id, id),
          eq(t.claimedAt, claimedAt),
          isNull(t.psbt),
          isNull(t.invalidatedAt),
          notConfirmed,
        ),
      )
      .returning({ id: t.id });
    return rows.length > 0;
  }

  /**
   * Stores a fresh canister signature for the same tx when the previous one is invalidated,
   * expired, or was claimed before `claimStaleBefore`. Callers must first make sure a previously
   * claimed tx is not in the mempool or on-chain.
   */
  async function refreshSignedPsbt(
    id: number,
    psbt: string,
    signedAfter: Date,
    claimStaleBefore: Date,
  ) {
    const rows = await sql
      .update(t)
      // claimedAt stays: a once-claimed tx may be on the network, so the monitor keeps checking it
      .set({ psbt, timestamp: new Date(), invalidatedAt: null })
      .where(
        and(
          eq(t.id, id),
          notConfirmed,
          or(
            isNotNull(t.invalidatedAt),
            and(isNotNull(t.psbt), lt(t.timestamp, signedAfter)),
            and(isNull(t.psbt), lt(t.claimedAt, claimStaleBefore)),
          ),
        ),
      )
      .returning({ id: t.id });
    return rows.length > 0;
  }

  return {
    getByPrepareTxid,
    getMonitorBatch,
    claimSignedPsbt,
    recordBroadcastTxid,
    expireSignedPsbt,
    invalidateClaim,
    refreshSignedPsbt,
  };
}
