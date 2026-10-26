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

  const entries = await db.unstake.getAfterBlock(last_block - expectedConfirmations);
  const blockHeights = await mapWithConcurrencyLimit(entries, MONITOR_CONCURRENCY, (entry) =>
    mempool.transactions.getTxStatus({ txid: entry.txid! }),
  );

  const validUpdates = blockHeights.flatMap((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value.confirmed ? [{ ...entries[i], ...result.value }] : [];
    }
    logger.warn('Failed to fetch unstake transaction status', {
      txid: entries[i].txid,
      error: result.reason,
    });
    return [];
  });

  // A tx the network knows about is live, even if its broadcast looked failed
  const knownInvalidated = entries
    .filter((entry, i) => blockHeights[i].status === 'fulfilled' && entry.invalidatedAt)
    .map((entry) => entry.id);
  if (knownInvalidated.length > 0) {
    logger.info(`Restoring ${knownInvalidated.length} unstakes found on the network`);
    await db.unstake.update(knownInvalidated, { invalidatedAt: null });
  }

  // TODO: filter the ones that have the same block height

  for (const [block, entries] of Map.groupBy(validUpdates, (v) => v.block_height).entries()) {
    if (last_block - block <= expectedConfirmations) continue;

    const ids = entries.map((e) => e.id);
    logger.info(`Updating ${ids.length} unstakes to block ${block}`);
    // Confirmed on-chain: the tx is live even if an earlier broadcast reported failure, and its
    // stored signature must never be broadcast again
    await db.unstake.update(ids, { block, invalidatedAt: null, psbt: null });
  }

  return Response.json({ success: true });
}
