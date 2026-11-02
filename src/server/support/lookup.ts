import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { mempool } from '@/providers/mempool';

import { createBudget, withinBudget, type Budget } from './budget';
import { SUPPORT_PORTFOLIO_URL, SUPPORT_UNSTAKE_URL } from './constants';
import { fetchTxChainStatus, hasStakingActivity } from './facts';
import { TxChainState, type TxChainStatus } from './types';

export enum LookupOperation {
  Stake = 'stake',
  Unstake = 'unstake',
  Claim = 'claim',
}

export enum LookupStatus {
  Pending = 'pending',
  Confirming = 'confirming',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

export type AddressLookupResult = {
  hasActivity: boolean;
  deepLink?: string;
  connectHint?: string;
};

export type TxLookupResult =
  | { found: false }
  | {
      found: true;
      operation: LookupOperation;
      status: LookupStatus;
      category?: 'other';
      confirmations?: number;
      requiredConfirmations?: number;
      deepLink: string;
    };

/** Routing only: never amounts, states or anything beyond "has activity here". */
export async function lookupAddress(address: string): Promise<AddressLookupResult> {
  if (!(await hasStakingActivity(address))) return { hasActivity: false };
  return {
    hasActivity: true,
    deepLink: SUPPORT_PORTFOLIO_URL,
    connectHint: 'connect the wallet whose Ordinals (Taproot) address is this address',
  };
}

type TxProgress = Pick<
  Extract<TxLookupResult, { found: true }>,
  'status' | 'category' | 'confirmations' | 'requiredConfirmations'
>;

export function txProgress(
  chain: TxChainStatus,
  recordedConfirmed: boolean,
  tipHeight: number | null,
): TxProgress {
  const requiredConfirmations = publicConfig.protocol.expectedConfirmations;

  if (recordedConfirmed) return { status: LookupStatus.Completed };

  switch (chain.state) {
    case TxChainState.NotFound:
      return { status: LookupStatus.Failed, category: 'other' };
    case TxChainState.Unknown:
      return { status: LookupStatus.Pending };
    case TxChainState.Unconfirmed:
      return { status: LookupStatus.Confirming, confirmations: 0, requiredConfirmations };
    case TxChainState.Confirmed: {
      if (tipHeight === null) return { status: LookupStatus.Processing };
      const confirmations = Math.max(0, tipHeight - chain.blockHeight + 1);
      if (confirmations < requiredConfirmations) {
        return { status: LookupStatus.Confirming, confirmations, requiredConfirmations };
      }
      // Confirmed on chain; the hourly monitor hasn't recorded it yet.
      return { status: LookupStatus.Processing };
    }
  }
}

async function tipHeightOrNull(budget: Budget) {
  try {
    return await withinBudget(budget, () => mempool.blocks.getBlocksTipHeight());
  } catch {
    return null;
  }
}

/** Status only: no addresses, amounts or counterparties. */
export async function lookupTxid(txid: string): Promise<TxLookupResult> {
  const [stake, unstake, claim] = await Promise.all([
    db.stake.getByTxid(txid),
    db.unstake.getByTxid(txid),
    db.unstake.getByClaimTx(txid),
  ]);

  const match = stake
    ? {
        operation: LookupOperation.Stake,
        recorded: stake.block !== null,
        link: SUPPORT_PORTFOLIO_URL,
      }
    : unstake
      ? {
          operation: LookupOperation.Unstake,
          recorded: unstake.block !== null,
          link: SUPPORT_UNSTAKE_URL,
        }
      : claim
        ? {
            operation: LookupOperation.Claim,
            recorded: claim.claimTxBlock !== null,
            link: SUPPORT_UNSTAKE_URL,
          }
        : null;

  if (!match) return { found: false };

  const budget = createBudget();
  const [chain, tipHeight] = await Promise.all([
    match.recorded
      ? Promise.resolve<TxChainStatus>({ state: TxChainState.Unknown })
      : fetchTxChainStatus(txid, budget),
    match.recorded ? Promise.resolve(null) : tipHeightOrNull(budget),
  ]);

  return {
    found: true,
    operation: match.operation,
    ...txProgress(chain, match.recorded, tipHeight),
    deepLink: match.link,
  };
}
