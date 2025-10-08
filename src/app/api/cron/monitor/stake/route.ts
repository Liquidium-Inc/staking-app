import { NextRequest } from 'next/server';

import { config } from '@/config/config';
import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { logger } from '@/lib/logger';
import { mempool } from '@/providers/mempool';

export const maxDuration = 60;

const expectedConfirmations = publicConfig.protocol.expectedConfirmations;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${config.secrets.cron}`)
    return new Response('Unauthorized', { status: 401 });

  const last_block = await mempool.blocks.getBlocksTipHeight();

  const entries = await db.stake.getAfterBlock(last_block - expectedConfirmations);
  const blockHeights = await Promise.all(
    entries.map(async (entry) => mempool.transactions.getTxStatus({ txid: entry.txid! })),
  );

  const validUpdates = blockHeights
    .map((block, i) => ({ ...entries[i], ...block }))
    .filter((update) => update.confirmed);

  // TODO: filter the ones that have the same block height

  for (const [block, entries] of Map.groupBy(validUpdates, (v) => v.block_height).entries()) {
    if (last_block - block <= expectedConfirmations) continue;

    const ids = entries.map((e) => e.id);
    logger.info(`Updating ${ids.length} stakes to block ${block}`);
    await db.stake.update(ids, { block });
  }

  return Response.json({ success: true });
}
