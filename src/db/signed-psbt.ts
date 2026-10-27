import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql as sqlTag,
} from 'drizzle-orm';

import { sql } from './client';
import { stakes, unstakes } from './schema';

/** How long rows that may never have reached the network are polled. */
export const MONITOR_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Attempted sends are never given up: they may still confirm. Once the network hasn't shown one for
 * 30 days (Bitcoin Core drops unconfirmed txs after 14), it is only checked once a day.
 */
const ATTEMPTED_SEND_SLOW_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const ATTEMPTED_SEND_SLOW_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
  // Once the network accepted the tx, the claim must never be released or re-armed
  const notBroadcast = isNull(t.broadcastAt);

  async function getByPrepareTxid(prepareTxid: string) {
    const [value] = await sql.select().from(t).where(eq(t.prepareTxid, prepareTxid)).limit(1);
    return value;
  }

  /**
   * Unsettled rows that were handed to (or may be on) the network, least recently checked first.
   * Invalidated rows are only polled for a week, so abandoned attempts stop being checked.
   * `exclude` holds ids already checked in the current monitor run.
   */
  async function getMonitorBatch(exclude: number[], limit: number) {
    const now = Date.now();
    const pendingCutoff = new Date(now - MONITOR_PENDING_MAX_AGE_MS);
    const slowAfter = new Date(now - ATTEMPTED_SEND_SLOW_AFTER_MS);
    const slowCheckedBefore = new Date(now - ATTEMPTED_SEND_SLOW_INTERVAL_MS);
    return await sql
      .select()
      .from(t)
      .where(
        and(
          notConfirmed,
          isNotNull(t.claimedAt),
          isNull(t.supersededAt),
          or(
            // Valid claims, including attempted sends, are checked until they settle. Attempts the
            // network hasn't shown for a long time are checked at most once a day.
            and(
              isNull(t.invalidatedAt),
              or(
                isNull(t.broadcastAt),
                gte(t.broadcastAt, slowAfter),
                isNull(t.lastCheckedAt),
                lt(t.lastCheckedAt, slowCheckedBefore),
              ),
            ),
            // Invalidated rows were never sent; they are only checked for a while
            and(isNotNull(t.invalidatedAt), gte(t.timestamp, pendingCutoff)),
          ),
          exclude.length > 0 ? notInArray(t.id, exclude) : undefined,
        ),
      )
      .orderBy(sqlTag`${t.lastCheckedAt} asc nulls first`, asc(t.id))
      .limit(limit);
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

  /**
   * Records the finalized tx's txid and the send attempt for the given claim. Must happen before
   * broadcasting, so a crash or lost response afterwards can never release the claim.
   */
  async function recordBroadcastTxid(id: number, claimedAt: Date, txid: string) {
    const rows = await sql
      .update(t)
      // The send is about to happen: from here on the tx may be on the network
      .set({ txid, broadcastAt: new Date() })
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
          notBroadcast,
        ),
      )
      .returning({ id: t.id });
    return rows.length > 0;
  }

  /**
   * Releases claims among `ids` made before `claimStaleBefore` whose tx the network doesn't know.
   * One statement per monitor page; broadcast or newer claims are never touched.
   */
  async function releaseStaleClaims(ids: number[], claimStaleBefore: Date) {
    if (ids.length === 0) return;
    await sql
      .update(t)
      .set({ invalidatedAt: new Date() })
      .where(
        and(
          inArray(t.id, ids),
          lt(t.claimedAt, claimStaleBefore),
          isNull(t.psbt),
          isNull(t.invalidatedAt),
          notConfirmed,
          notBroadcast,
        ),
      );
  }
  /** Settles rows at their confirmed blocks in one statement; the stored PSBT is retired. */
  async function settle(blocks: { id: number; block: number }[]) {
    if (blocks.length === 0) return;
    const cases = sqlTag.join(
      blocks.map(({ id, block }) => sqlTag`when ${id} then ${block}::integer`),
      sqlTag` `,
    );
    await sql
      .update(t)
      .set({ block: sqlTag`case ${t.id} ${cases} end`, invalidatedAt: null, psbt: null })
      .where(
        and(
          inArray(
            t.id,
            blocks.map(({ id }) => id),
          ),
          notConfirmed,
        ),
      );
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
          notBroadcast,
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
    releaseStaleClaims,
    settle,
    refreshSignedPsbt,
  };
}
