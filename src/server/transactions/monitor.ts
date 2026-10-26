import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { mapWithConcurrencyLimit } from '@/lib/async';
import { logger } from '@/lib/logger';
import { mempool } from '@/providers/mempool';

/** Tunables for one monitor run; the cron routes have maxDuration = 60s. */
export const MONITOR_LIMITS = {
  /** No new lookups are started after this much of the run has passed. */
  budgetMs: 45_000,
  /** Generous so slow but healthy lookups still settle; budget + timeout stays under 60s. */
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
  const lastBlock = await mempool.blocks.getBlocksTipHeight();
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

    const known = batch.flatMap((entry, i) => {
      const result = results[i];
      if (result.status === 'rejected') {
        logger.warn(`Failed to fetch ${kind} transaction status`, {
          txid: entry.txid,
          error: result.reason,
        });
        return [];
      }
      const status = result.value;
      return status === SKIPPED ? [] : [{ ...entry, ...status }];
    });

    // The network knows these txs: retire any stored signature so it can never be broadcast again,
    // and un-hide rows whose broadcast looked failed
    const retire = known.filter((entry) => entry.psbt || entry.invalidatedAt).map((e) => e.id);
    if (retire.length > 0) {
      logger.info(`Retiring signatures of ${retire.length} ${kind}s found on the network`);
      await table.update(retire, { psbt: null, invalidatedAt: null });
    }

    const settled = known.filter(
      (entry) =>
        entry.confirmed && entry.block_height !== undefined && entry.block_height < settledBelow,
    );
    for (const [block, entries] of Map.groupBy(settled, (entry) => entry.block_height!)) {
      logger.info(`Updating ${entries.length} ${kind}s to block ${block}`);
      await table.update(
        entries.map((entry) => entry.id),
        { block, invalidatedAt: null, psbt: null },
      );
    }

    if (checked.length < batch.length) break;
  }
}
