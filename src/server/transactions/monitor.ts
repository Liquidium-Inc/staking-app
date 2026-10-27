import axios from 'axios';

import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { mapWithConcurrencyLimit } from '@/lib/async';
import { canisterClaimStaleBefore } from '@/lib/canister-signature';
import { logger } from '@/lib/logger';
import { mempool } from '@/providers/mempool';

/** Tunables for one monitor run; the cron routes have maxDuration = 60s. */
export const MONITOR_LIMITS = {
  /**
   * No new lookups are started after this much of the run has passed (the tip call counts too).
   * The last lookups then need at most lookupTimeoutMs, leaving ~10s for DB writes before 60s.
   */
  budgetMs: 40_000,
  /** Generous so slow but healthy lookups still settle. */
  lookupTimeoutMs: 10_000,
  concurrency: 8,
  pageSize: 100,
};

const SKIPPED = Symbol('skipped');
type TxStatus = Awaited<ReturnType<typeof mempool.transactions.getTxStatus>>;

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Lookup timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Checks stake/unstake txs against the network, least recently checked first, so every eligible
 * row is eventually checked however many there are and however slow lookups get.
 * - any tx the network knows: its stored PSBT is retired and the row un-hidden
 * - deep enough confirmations: the row is settled at that block
 */
export async function monitorSignedTxs(kind: 'stake' | 'unstake') {
  const table = db[kind];
  const deadline = Date.now() + MONITOR_LIMITS.budgetMs;
  const lastBlock = await withTimeout(
    mempool.blocks.getBlocksTipHeight(),
    MONITOR_LIMITS.lookupTimeoutMs,
  );
  const settledBelow = lastBlock - publicConfig.protocol.expectedConfirmations;
  const checkedIds: number[] = [];

  while (Date.now() < deadline) {
    const batch = await table.getMonitorBatch(checkedIds, MONITOR_LIMITS.pageSize);
    if (batch.length === 0) break;

    const results = await mapWithConcurrencyLimit(
      batch,
      MONITOR_LIMITS.concurrency,
      (entry): Promise<TxStatus | typeof SKIPPED> =>
        Date.now() < deadline
          ? withTimeout(
              mempool.transactions.getTxStatus({ txid: entry.txid }),
              MONITOR_LIMITS.lookupTimeoutMs,
            )
          : Promise.resolve(SKIPPED),
    );
    const checked = batch.filter((_, i) => {
      const result = results[i];
      return result.status === 'rejected' || result.value !== SKIPPED;
    });
    checkedIds.push(...checked.map((entry) => entry.id));
    if (checked.length > 0) {
      await table.update(
        checked.map((entry) => entry.id),
        { lastCheckedAt: new Date() },
      );
    }

    const unknown: typeof batch = [];
    const known = batch.flatMap((entry, i) => {
      const result = results[i];
      if (result.status === 'rejected') {
        // 404 just means the network doesn't know the tx (yet); only real failures are warnings
        const notFound =
          axios.isAxiosError(result.reason) && result.reason.response?.status === 404;
        if (notFound) unknown.push(entry);
        else {
          logger.warn(`Failed to fetch ${kind} transaction status`, {
            txid: entry.txid,
            error: result.reason,
          });
        }
        return [];
      }
      const status = result.value;
      return status === SKIPPED ? [] : [{ ...entry, ...status }];
    });

    // Unknown to the network:
    // - a stale claim with no send attempt was never broadcast: release it like confirm does
    //   (invalidated rows are still polled for a week, so a lagging tx recovers)
    // - an attempted send is never released on a 404; it is checked until it settles
    await table.releaseStaleClaims(
      unknown.map((entry) => entry.id),
      canisterClaimStaleBefore(),
    );

    // The network knows these txs: retire any stored signature so it can never be broadcast again,
    // un-hide rows whose broadcast looked failed, and record the send
    const retire = known.filter((entry) => entry.psbt || entry.invalidatedAt).map((e) => e.id);
    if (retire.length > 0) {
      logger.info(`Retiring signatures of ${retire.length} ${kind}s found on the network`);
      await table.update(retire, { psbt: null, invalidatedAt: null });
    }
    const seen = known.filter((entry) => !entry.broadcastAt).map((e) => e.id);
    if (seen.length > 0) await table.update(seen, { broadcastAt: new Date() });

    const settled = known.flatMap((entry) =>
      entry.confirmed && entry.block_height !== undefined && entry.block_height < settledBelow
        ? [{ id: entry.id, block: entry.block_height }]
        : [],
    );
    if (settled.length > 0) {
      logger.info(`Settling ${settled.length} ${kind}s`);
      await table.settle(settled);
    }

    if (checked.length < batch.length) break;
  }
}
