import { NextRequest } from 'next/server';

import { config } from '@/config/config';
import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { logger } from '@/lib/logger';
import { canister } from '@/providers/canister';
import { mempool } from '@/providers/mempool';

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${config.secrets.cron}`)
    return new Response('Unauthorized', { status: 401 });

  const { circulating, balance } = await canister.getExchangeRate();
  const stakedBalance = BigInt(publicConfig.sRune.supply) - circulating;
  const block_height = await mempool.blocks.getBlocksTipHeight();

  logger.info('Inserting/updating pool balances into db');
  await db.poolBalance.insert(stakedBalance.toString(), balance.toString(), block_height);

  return Response.json({ success: true });
}
