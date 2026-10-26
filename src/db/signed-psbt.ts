import { and, eq, gte, isNotNull, isNull, lt, or } from 'drizzle-orm';

import { sql } from './client';
import { stakes, unstakes } from './schema';

/**
 * Lifecycle of the canister-signed PSBT stored on a stake/unstake row. Every transition is a
 * single conditional UPDATE, so concurrent requests can't both win, and none of them touch a row
 * whose tx is confirmed on-chain (`block` set).
 *
 *   signed (psbt, timestamp) --claim--> claimed (claimedAt) --broadcast ok--> pending/confirmed
 *        |                                  |  broadcast failed / stale and not on-chain
 *        v expire                           v
 *   invalidated (invalidatedAt) <-----------+         invalidated/expired/stale --refresh--> signed
 */
export function signedPsbtQueries(table: typeof stakes | typeof unstakes) {
  // Both tables share these columns; drizzle can't build queries over a table union.
  const t = table as typeof stakes;
  const notConfirmed = isNull(t.block);

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
  async function invalidateClaim(id: number, claimedAt: Date, txid?: string) {
    const rows = await sql
      .update(t)
      .set({ invalidatedAt: new Date(), ...(txid ? { txid } : {}) })
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
      .set({ psbt, timestamp: new Date(), claimedAt: null, invalidatedAt: null })
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

  return { claimSignedPsbt, expireSignedPsbt, invalidateClaim, refreshSignedPsbt };
}
