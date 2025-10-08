import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { logger } from '@/lib/logger';
import { pick } from '@/lib/pick';
import type { TxInfo } from '@/lib/types';
import { mempool } from '@/providers/mempool';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const querySchema = z.object({ address: z.string().min(1) });
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  const { address } = parsed.data;

  const last_block = await mempool.blocks.getBlocksTipHeight();

  const stakes = await db.stake.getPendingsOf(address);

  // Fetch transaction data with error handling
  const txResults = await Promise.allSettled(
    stakes.map(({ txid }) => mempool.transactions.getTx({ txid })),
  );

  // Filter out failed requests and create entries only for successful ones
  const entries = txResults
    .map((result, i) => {
      if (result.status === 'fulfilled') {
        const tx = result.value as TxInfo;
        return {
          ...pick(tx, 'fee', 'locktime', 'size', 'status'),
          ...stakes[i],
        };
      } else {
        logger.warn('Failed to fetch transaction data', {
          txid: stakes[i].txid,
          error: result.reason,
        });
        return null;
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const txStatusSchema = z.union([
    z.object({ confirmed: z.literal(true) }).passthrough(),
    z.object({ confirmed: z.literal(false) }).passthrough(),
  ]);

  const entrySchema = z
    .object({
      fee: z.number(),
      locktime: z.number(),
      size: z.number(),
      status: txStatusSchema,
      txid: z.string(),
    })
    .passthrough();

  const responseSchema = z.object({
    entries: z.array(entrySchema),
    last_block: z.number(),
  });

  const responseParse = responseSchema.safeParse({ entries, last_block });
  if (!responseParse.success) {
    logger.error('stake/pending response validation failed', responseParse.error);
    return NextResponse.json({ entries: [], last_block }, { status: 500 });
  }

  return NextResponse.json(responseParse.data);
}
