import Big from 'big.js';

import { SUPPORT_RECENT_ACTIVITY_LIMIT } from './constants';
import {
  ClaimStatus,
  TxChainState,
  type KindTotals,
  type LabelledValue,
  type StakeFact,
  type StakingFacts,
  type TxChainStatus,
  type UnstakeFact,
} from './types';

export type DerivedUnstake = {
  txid: string;
  amount: string;
  sAmount: string;
  ts: number;
  confirmedAt: number | null;
  unlockAt: number | null;
  withdrawable: boolean;
  claimTx: string | null;
  claimStatus: ClaimStatus;
};

function claimStatusOf(claimTx: string | null, claimChain: TxChainStatus | null): ClaimStatus {
  if (!claimTx) return ClaimStatus.None;
  switch (claimChain?.state) {
    case TxChainState.Confirmed:
      return ClaimStatus.Confirmed;
    case TxChainState.Unconfirmed:
      return ClaimStatus.Pending;
    case TxChainState.NotFound:
      return ClaimStatus.NotFound;
    default:
      return ClaimStatus.Unknown;
  }
}

export function deriveUnstake(fact: UnstakeFact, withdrawTimeMs: number, nowMs: number) {
  const confirmedAt = fact.chain.state === TxChainState.Confirmed ? fact.chain.blockTimeMs : null;
  const unlockAt = confirmedAt === null ? null : confirmedAt + withdrawTimeMs;
  const derived: DerivedUnstake = {
    txid: fact.txid,
    amount: fact.amount,
    sAmount: fact.sAmount,
    ts: fact.createdAtMs,
    confirmedAt,
    unlockAt,
    withdrawable: unlockAt !== null && unlockAt <= nowMs && !fact.claimTx,
    claimTx: fact.claimTx,
    claimStatus: claimStatusOf(fact.claimTx, fact.claimChain),
  };
  return derived;
}

/** Stakes still unsettled in our records that actually reached the network. */
export function pendingStakesOf(facts: StakingFacts): StakeFact[] {
  return facts.stakes.filter(
    (stake) => !stake.recordedConfirmed && stake.chain.state !== TxChainState.NotFound,
  );
}

/** Unstakes that reached the network (abandoned unsigned PSBTs are dropped). */
export function broadcastUnstakesOf(facts: StakingFacts): UnstakeFact[] {
  return facts.unstakes.filter((unstake) => unstake.chain.state !== TxChainState.NotFound);
}

/** One stake as the summary and /list show it. */
export function stakeItem(stake: StakeFact) {
  return {
    txid: stake.txid,
    state: stake.state,
    amount: stake.amount,
    sAmount: stake.sAmount,
    ts: stake.createdAtMs,
    confirmed: stake.recordedConfirmed || stake.chain.state === TxChainState.Confirmed,
    feeRate: stake.feeRate,
  };
}

/** One unstake as the summary and /list show it. */
export function unstakeItem(unstake: UnstakeFact, withdrawTimeMs: number, nowMs: number) {
  return { state: unstake.state, ...deriveUnstake(unstake, withdrawTimeMs, nowMs) };
}

/** Exact totals so the bot never mistakes the summary list for the whole history. */
function countOf(totals: KindTotals, shown: number) {
  return { ...totals, shown };
}

const isPositive = (amount: string | null) => amount !== null && new Big(amount).gt(0);

/** False for addresses we know nothing about: no stake records and no LIQ or sLIQ. */
export function hasStakingFootprint(facts: StakingFacts) {
  return (
    (facts.totals.stakes.total ?? 0) > 0 ||
    (facts.totals.unstakes.total ?? 0) > 0 ||
    isPositive(facts.liqBalance) ||
    isPositive(facts.sliqBalance) ||
    // If balances couldn't be read we can't claim the address is unknown.
    facts.liqBalance === null
  );
}

/** Compact, allowlisted summary for the support bot. Field-by-field on purpose. */
export function buildSummary(facts: StakingFacts, nowMs: number) {
  const stakes = facts.stakes.map(stakeItem);
  const unstakes = broadcastUnstakesOf(facts).map((unstake) =>
    unstakeItem(unstake, facts.withdrawTimeMs, nowMs),
  );
  const recentActivity = facts.recentActivity?.slice(0, SUPPORT_RECENT_ACTIVITY_LIMIT) ?? null;
  return {
    found: true,
    address: facts.address,
    addressType: facts.addressType,
    balances: {
      liq: facts.liqBalance,
      sliq: facts.sliqBalance,
      btcSats: facts.btcSats === null ? null : facts.btcSats.toString(),
    },
    exchangeRate: facts.exchangeRate,
    mixedRuneUtxoCount: facts.mixedRuneUtxoCount,
    stakes,
    unstakes,
    recentActivity,
    counts: {
      stakes: countOf(facts.totals.stakes, stakes.length),
      unstakes: countOf(facts.totals.unstakes, unstakes.length),
      activity: countOf(facts.totals.activity, recentActivity?.length ?? 0),
    },
    unavailable: facts.unavailable,
  };
}

export function buildValues(facts: StakingFacts): LabelledValue[] {
  // The user's own wallet address: never a deposit destination. Staking has no
  // per-user deposit address, so no value is marked as a destination.
  return [
    {
      ref: 'ref:staking.wallet_address',
      label: 'your connected staking wallet address',
      value: facts.address,
      destination: false,
    },
  ];
}
