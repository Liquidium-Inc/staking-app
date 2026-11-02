import { z } from 'zod';

import { config as publicConfig } from '@/config/public';
import { db } from '@/db';

import { createBudget, type Budget } from './budget';
import { MS_PER_SECOND } from './constants';
import { resolveUnstakeChains, toStakeFacts, toUnstakeFacts } from './facts';
import { txProgress } from './lookup';
import { unstakeItem } from './summary';

export const SUPPORT_ITEM_KINDS = ['stake', 'unstake'] as const;
export const itemRequestSchema = z.object({
  kind: z.enum(SUPPORT_ITEM_KINDS),
  id: z.string().trim().toLowerCase().min(1).max(128),
});
export type ItemRequest = z.infer<typeof itemRequestSchema>;

/**
 * Returns one stake or unstake (by txid, or claim txid for unstakes) from the
 * address's own records, or null when it isn't one of them. Looked up by exact
 * txid, so any record is found, however old.
 */
export async function loadSupportItem(
  address: string,
  request: ItemRequest,
  nowMs = Date.now(),
  budget: Budget = createBudget(),
) {
  if (request.kind === 'stake') {
    const row = await db.stake.getOwnByTxid(address, request.id);
    if (!row) return null;
    const [stake] = (await toStakeFacts([row], budget)).items;
    return {
      kind: request.kind,
      txid: stake.txid,
      state: stake.state,
      amount: stake.amount,
      sAmount: stake.sAmount,
      ts: stake.createdAtMs,
      feeRate: stake.feeRate,
      ...txProgress(stake.chain, stake.recordedConfirmed, null),
    };
  }

  const row = await db.unstake.getOwnByTxid(address, request.id);
  if (!row) return null;
  const [checked] = (await toUnstakeFacts([row], budget)).items;
  const [unstake] = await resolveUnstakeChains([checked], budget);
  const withdrawTimeMs = publicConfig.protocol.withdrawTime * MS_PER_SECOND;
  return { kind: request.kind, ...unstakeItem(unstake, withdrawTimeMs, nowMs) };
}
