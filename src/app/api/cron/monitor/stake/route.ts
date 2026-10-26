import { NextRequest } from 'next/server';

import { config } from '@/config/config';
import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { mapWithConcurrencyLimit } from '@/lib/async';
import { logger } from '@/lib/logger';
import { mempool } from '@/providers/mempool';

export const maxDuration = 60;

const expectedConfirmations = publicConfig.protocol.expectedConfirmations;
const MONITOR_CONCURRENCY = 8;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${config.secrets.cron}`)
    return new Response('Unauthorized', { status: 401 });

  const last_block = await mempool.blocks.getBlocksTipHeight();

  // Page through every eligible row so old ones are never starved by newer ones. Each page is
  // fully processed before the next is fetched, so progress survives a timeout.
  const settledAfter = last_block - expectedConfirmations;
  for (
    let batch = await db.stake.getMonitorBatch(settledAfter);
    batch.length > 0;
    batch = await db.stake.getMonitorBatch(settledAfter, batch[batch.length - 1].id)
  ) {
    await processBatch(batch, last_block);
  }

  return Response.json({ success: true });
}

async function processBatch(
  entries: Awaited<ReturnType<typeof db.stake.getMonitorBatch>>,
  last_block: number,
) {
  const blockHeights = await mapWithConcurrencyLimit(entries, MONITOR_CONCURRENCY, (entry) =>
    mempool.transactions.getTxStatus({ txid: entry.txid! }),
  );

  const validUpdates = blockHeights.flatMap((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value.confirmed ? [{ ...entries[i], ...result.value }] : [];
    }
    logger.warn('Failed to fetch stake transaction status', {
      txid: entries[i].txid,
      error: result.reason,
    });
    return [];
  });

  // The network knows these txs: retire any stored signature so it can never be broadcast again,
  // and un-hide rows whose broadcast looked failed
  const known = entries
    .filter(
      (entry, i) => blockHeights[i].status === 'fulfilled' && (entry.psbt || entry.invalidatedAt),
    )
    .map((entry) => entry.id);
  if (known.length > 0) {
    logger.info(`Retiring signatures of ${known.length} stakes found on the network`);
    await db.stake.update(known, { psbt: null, invalidatedAt: null });
  }

  // TODO: filter the ones that have the same block height

  for (const [block, entries] of Map.groupBy(validUpdates, (v) => v.block_height).entries()) {
    if (last_block - block <= expectedConfirmations) continue;

    const ids = entries.map((e) => e.id);
    logger.info(`Updating ${ids.length} stakes to block ${block}`);
    // Confirmed on-chain: the tx is live even if an earlier broadcast reported failure, and its
    // stored signature must never be broadcast again
    await db.stake.update(ids, { block, invalidatedAt: null, psbt: null });
  }
}
