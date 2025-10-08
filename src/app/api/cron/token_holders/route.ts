import { NextRequest } from 'next/server';

import { config } from '@/config/config';
import { config as publicConfig } from '@/config/public';
import { sql, schema } from '@/db';
import { logger } from '@/lib/logger';
import { runeProvider } from '@/providers/rune-provider';

const STAKED_RUNE_ID = publicConfig.sRune.id;
const MAX_COUNT = 5000;

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${config.secrets.cron}`)
    return new Response('Unauthorized', { status: 401 });

  let offset = 0;
  while (true) {
    logger.info(`Fetching token ${STAKED_RUNE_ID} holders with offset ${offset}`);
    const { data, block_height } = await runeProvider.runes.holders({
      rune_id: STAKED_RUNE_ID,
      count: MAX_COUNT,
      offset,
    });

    logger.info(`Inserting ${data.length} token ${STAKED_RUNE_ID} holders with offset ${offset}`);
    await sql.insert(schema.tokenBalances).values(
      data.map((item) => ({
        address: item.wallet_addr,
        tokenSymbol: STAKED_RUNE_ID,
        balance: item.total_balance.toString(),
        block: block_height,
      })),
    );
    if (data.length < MAX_COUNT) {
      break;
    }
    offset += MAX_COUNT;
  }

  return Response.json({ success: true });
}
