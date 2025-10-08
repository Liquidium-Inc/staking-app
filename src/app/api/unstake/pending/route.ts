import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { logger } from '@/lib/logger';
import { pick } from '@/lib/pick';
import type { TxInfo } from '@/lib/types';
import { mempool } from '@/providers/mempool';
type UnstakeCandidate = { address: string; txid: string; claimTx: string | null };

function isUnstakeCandidate(u: unknown): u is UnstakeCandidate {
  return (
    typeof u === 'object' &&
    u !== null &&
    typeof (u as { address?: unknown }).address === 'string' &&
    typeof (u as { txid?: unknown }).txid === 'string' &&
    'claimTx' in u &&
    ((u as { claimTx?: unknown }).claimTx === null ||
      typeof (u as { claimTx?: unknown }).claimTx === 'string')
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 });

  const last_block = await mempool.blocks.getBlocksTipHeight();

  // 1) Unstakes that have not yet been claimed
  const unstakes = await db.unstake.getPendingsOf(address);
  const unstakeBaseTxResults = await Promise.allSettled(
    unstakes.map(({ txid }) => mempool.transactions.getTx({ txid })),
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
  const maybeGetWithdrawAfterBlock = (
    db.unstake as { getWithdrawAfterBlock?: (block: number) => Promise<unknown[]> }
  ).getWithdrawAfterBlock;

  const maybeGetAfterBlock = (
    db.unstake as { getAfterBlock?: (block: number) => Promise<unknown[]> }
  ).getAfterBlock;

  const rawCandidates: unknown[] = maybeGetWithdrawAfterBlock
    ? await maybeGetWithdrawAfterBlock(last_block)
    : typeof maybeGetAfterBlock === 'function'
      ? await maybeGetAfterBlock(last_block)
      : [];
  const candidates = (rawCandidates as unknown[]).filter(isUnstakeCandidate);
  const withdrawing = candidates.filter((u) => u.address === address && !!u.claimTx);

  const withdrawingBaseTxResults = await Promise.allSettled(
    withdrawing.map(({ txid }) => mempool.transactions.getTx({ txid })),
  );
  const withdrawingClaimTxResults = await Promise.allSettled(
    withdrawing.map(({ claimTx }) =>
      claimTx ? mempool.transactions.getTx({ txid: claimTx }) : Promise.resolve(null),
    ),
  );

  const withdrawingEntries = withdrawingBaseTxResults
    .map((result, i) => {
      if (result.status === 'fulfilled') {
        const tx = result.value as TxInfo;
        const claimResult = withdrawingClaimTxResults[i];
        const claimTxInfo =
          claimResult.status === 'fulfilled' ? (claimResult.value as TxInfo | null) : null;

        if (claimResult.status === 'rejected') {
          logger.warn('Failed to fetch claim transaction data', {
            claimTxid: withdrawing[i].claimTx,
            error: claimResult.reason,
          });
        }

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
