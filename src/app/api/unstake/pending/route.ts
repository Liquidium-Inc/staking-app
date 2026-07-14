import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { addressesMatch } from '@/lib/address';
import { mapWithConcurrencyLimit } from '@/lib/async';
import { logger } from '@/lib/logger';
import { pick } from '@/lib/pick';
import type { TxInfo } from '@/lib/types';
import { mempool } from '@/providers/mempool';
import { requireSession, UnauthorizedError } from '@/server/auth/session';

const MEMPOOL_LOOKUP_CONCURRENCY = 4;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 });

  try {
    const session = await requireSession(request);
    if (!addressesMatch(session.address, address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw error;
  }

  const last_block = await mempool.blocks.getBlocksTipHeight();

  // 1) Unstakes that have not yet been claimed
  const unstakes = await db.unstake.getPendingsOf(address);
  const unstakeBaseTxResults = await mapWithConcurrencyLimit(
    unstakes,
    MEMPOOL_LOOKUP_CONCURRENCY,
    ({ txid }) => mempool.transactions.getTx({ txid }),
  );

  const pendingEntries = unstakeBaseTxResults
    .map((result, i) => {
      if (result.status === 'fulfilled') {
        const tx = result.value as TxInfo;
        return {
          ...pick(tx, 'fee', 'locktime', 'size', 'status'),
          ...unstakes[i],
          claimTx: null,
        };
      } else {
        logger.warn('Failed to fetch unstake transaction data', {
          txid: unstakes[i].txid,
          error: result.reason,
        });
        return null;
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  // 2) Withdrawals in progress (claimTx exists but not yet settled)
  const withdrawing = (
    await db.unstake.getWithdrawAfterBlockForAddress(last_block, address)
  ).filter((candidate) => addressesMatch(candidate.address, address) && candidate.claimTx);

  const withdrawingTxResults = await mapWithConcurrencyLimit(
    withdrawing,
    MEMPOOL_LOOKUP_CONCURRENCY,
    async ({ txid, claimTx }) => {
      const [baseTx, claimTxInfo] = await Promise.all([
        mempool.transactions.getTx({ txid }),
        claimTx ? mempool.transactions.getTx({ txid: claimTx }) : Promise.resolve(null),
      ]);
      return { baseTx, claimTxInfo };
    },
  );

  const withdrawingEntries = withdrawingTxResults
    .map((result, i) => {
      if (result.status === 'fulfilled') {
        const tx = result.value.baseTx as TxInfo;
        const claimTxInfo = result.value.claimTxInfo as TxInfo | null;

        return {
          ...pick(tx, 'fee', 'locktime', 'size', 'status'),
          ...withdrawing[i],
          claimTx: claimTxInfo ? pick(claimTxInfo, 'fee', 'locktime', 'status', 'txid') : null,
        };
      } else {
        logger.warn('Failed to fetch withdrawing base transaction data', {
          txid: withdrawing[i].txid,
          error: result.reason,
        });
        return null;
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const entries = [...pendingEntries, ...withdrawingEntries];

  // Define response schema and validate before returning
  const txStatusSchema = z.union([
    // Allow minimal form used in tests
    z.object({ confirmed: z.literal(true) }).passthrough(),
    z.object({ confirmed: z.literal(false) }).passthrough(),
  ]);

  const claimTxSchema = z
    .object({
      fee: z.number(),
      locktime: z.number(),
      status: txStatusSchema,
      txid: z.string(),
    })
    .passthrough();

  const entrySchema = z
    .object({
      fee: z.number(),
      locktime: z.number(),
      size: z.number(),
      status: txStatusSchema,
      txid: z.string(),
      claimTx: z.union([claimTxSchema, z.null()]),
    })
    .passthrough();

  const responseSchema = z.object({
    entries: z.array(entrySchema),
    last_block: z.number(),
  });

  const parsed = responseSchema.safeParse({ entries, last_block });
  if (!parsed.success) {
    logger.error('unstake/pending response validation failed', parsed.error);
    return NextResponse.json({ entries: [], last_block }, { status: 500 });
  }

  return NextResponse.json(parsed.data);
}
