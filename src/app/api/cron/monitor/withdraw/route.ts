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

  const entries = await db.unstake.getWithdrawAfterBlock(last_block - expectedConfirmations);
  const blockHeights = await mapWithConcurrencyLimit(entries, MONITOR_CONCURRENCY, (entry) =>
    mempool.transactions.getTxStatus({ txid: entry.txid! }),
  );

  const validUpdates = blockHeights.flatMap((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value.confirmed ? [{ ...entries[i], ...result.value }] : [];
    }
    logger.warn('Failed to fetch withdrawal transaction status', {
      txid: entries[i].txid,
      error: result.reason,
    });
    return [];
  });

  // TODO: filter the ones that have the same block height

  for (const [block, entries] of Map.groupBy(validUpdates, (v) => v.block_height).entries()) {
    if (last_block - block <= expectedConfirmations) continue;

    const ids = entries.map((e) => e.id);
    logger.info(`Updating ${ids.length} claims to block ${block}`);
    await db.unstake.update(ids, { claimTxBlock: block });
  }

  return Response.json({ success: true });
}
