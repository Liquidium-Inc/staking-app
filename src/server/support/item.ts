import { z } from 'zod';

import { config as publicConfig } from '@/config/public';

import { MS_PER_SECOND } from './constants';
import { loadStakes, loadUnstakes } from './facts';
import { txProgress } from './lookup';
import { deriveUnstake } from './summary';

export const SUPPORT_ITEM_KINDS = ['stake', 'unstake'] as const;
export const itemRequestSchema = z.object({
  kind: z.enum(SUPPORT_ITEM_KINDS),
  id: z.string().trim().min(1).max(128),
});
export type ItemRequest = z.infer<typeof itemRequestSchema>;

/**
 * Returns one stake or unstake (by txid, or claim txid for unstakes) from the
 * address's own records, or null when it isn't one of them.
 */
export async function loadSupportItem(address: string, request: ItemRequest, nowMs = Date.now()) {
  if (request.kind === 'stake') {
    const stake = (await loadStakes(address)).find((candidate) => candidate.txid === request.id);
    if (!stake) return null;
    return {
      kind: request.kind,
      txid: stake.txid,
      amount: stake.amount,
      sAmount: stake.sAmount,
      ts: stake.createdAtMs,
      feeRate: stake.feeRate,
      ...txProgress(stake.chain, stake.recordedConfirmed, null),
    };
  }

  const unstake = (await loadUnstakes(address)).find(
    (candidate) => candidate.txid === request.id || candidate.claimTx === request.id,
  );
  if (!unstake) return null;
  const withdrawTimeMs = publicConfig.protocol.withdrawTime * MS_PER_SECOND;
  return { kind: request.kind, ...deriveUnstake(unstake, withdrawTimeMs, nowMs) };
}
