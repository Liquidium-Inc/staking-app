import { MONITOR_PENDING_MAX_AGE_MS } from '@/db/constants';

import { broadcastUnstakesOf, deriveUnstake, pendingStakesOf } from './summary';
import { TxChainState, type StakingFacts, type SupportHint } from './types';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// A stake normally confirms within a few blocks; a day unconfirmed means the fee
// was too low for current mempool conditions or the transaction is stuck.
export const STAKE_UNCONFIRMED_LONG_MS = 24 * MS_PER_HOUR;

// The status monitors only re-check unsettled rows created within this window
// (see MONITOR_PENDING_MAX_AGE_MS in the stake/unstake services). Older rows are
// never updated automatically and need a human.
export const PENDING_MONITOR_WINDOW_MS = MONITOR_PENDING_MAX_AGE_MS;

// RunePSBT enforces a 1,000 sat minimum fee; below that a withdrawal can't be funded
// from this address.
export const MIN_FEE_BALANCE_SATS = 1_000n;

const TXID_PREFIX_LENGTH = 8;

function shortTxid(txid: string) {
  return `${txid.slice(0, TXID_PREFIX_LENGTH)}…`;
}

function wholeHours(ms: number) {
  return Math.floor(ms / MS_PER_HOUR);
}

function wholeDays(ms: number) {
  return Math.floor(ms / MS_PER_DAY);
}

function isoDate(ms: number) {
  return new Date(ms).toISOString();
}

function stakeHints(facts: StakingFacts, nowMs: number): SupportHint[] {
  const hints: SupportHint[] = [];

  for (const stake of pendingStakesOf(facts)) {
    const ageMs = nowMs - stake.createdAtMs;

    if (stake.chain.state === TxChainState.Unconfirmed && ageMs > STAKE_UNCONFIRMED_LONG_MS) {
      const isLowFee =
        stake.feeRate !== null && facts.hourFeeRate !== null && stake.feeRate < facts.hourFeeRate;
      hints.push({
        code: 'stake_unconfirmed_long',
        severity: 'warn',
        message: isLowFee
          ? `Stake ${shortTxid(stake.txid)} has been unconfirmed for ${wholeHours(ageMs)}h at ${stake.feeRate} sat/vB, below the ~${facts.hourFeeRate} sat/vB currently needed to confirm within an hour.`
          : `Stake ${shortTxid(stake.txid)} has been unconfirmed for ${wholeHours(ageMs)}h.`,
        // A low fee explains the delay; an adequate fee that still hasn't confirmed doesn't.
        escalate: !isLowFee,
        data: {
          txid: stake.txid,
          feeRate: stake.feeRate,
          currentHourFeeRate: facts.hourFeeRate,
          lowFeeRate: isLowFee,
        },
      });
    }

    if (ageMs > PENDING_MONITOR_WINDOW_MS) {
      hints.push(pastMonitorWindowHint('Stake', stake.txid, ageMs));
    }
  }

  return hints;
}

function pastMonitorWindowHint(label: string, txid: string, ageMs: number): SupportHint {
  return {
    code: 'pending_past_monitor_window',
    severity: 'warn',
    message: `${label} ${shortTxid(txid)} has been pending in Liquidium's records for ${wholeDays(ageMs)} days, longer than the ${wholeDays(PENDING_MONITOR_WINDOW_MS)}-day window the status checker watches, so it won't update on its own.`,
    escalate: true,
    data: { txid },
  };
}

function unstakeHints(facts: StakingFacts, nowMs: number): SupportHint[] {
  const hints: SupportHint[] = [];
  let hasWithdrawable = false;

  for (const fact of broadcastUnstakesOf(facts)) {
    const unstake = deriveUnstake(fact, facts.withdrawTimeMs, nowMs);
    const ageMs = nowMs - fact.createdAtMs;

    if (unstake.unlockAt !== null && !unstake.claimTx && unstake.unlockAt > nowMs) {
      hints.push({
        code: 'unstake_cooldown_active',
        severity: 'info',
        message: `Unstake ${shortTxid(unstake.txid)} is in its cooldown until ${isoDate(unstake.unlockAt)}; it can be withdrawn after that.`,
        data: { txid: unstake.txid, unlockAt: unstake.unlockAt },
      });
    }

    if (unstake.withdrawable && unstake.unlockAt !== null) {
      hasWithdrawable = true;
      hints.push({
        code: 'unstake_withdrawable_unclaimed',
        severity: 'info',
        message: `Unstake ${shortTxid(unstake.txid)} finished its cooldown on ${isoDate(unstake.unlockAt)} and is ready to withdraw from the Unstake page.`,
        data: { txid: unstake.txid, unlockAt: unstake.unlockAt },
      });
    }

    if (!fact.recordedConfirmed && ageMs > PENDING_MONITOR_WINDOW_MS) {
      hints.push(pastMonitorWindowHint('Unstake', fact.txid, ageMs));
    }
  }

  if (hasWithdrawable && facts.btcSats !== null && facts.btcSats < MIN_FEE_BALANCE_SATS) {
    hints.push({
      code: 'no_btc_for_fees',
      severity: 'info',
      message: `The connected address holds ${facts.btcSats.toString()} sats of spendable BTC, not enough to pay the network fee for a withdrawal. Wallets with a separate payment address pay fees from that address instead.`,
      data: { btcSats: facts.btcSats.toString() },
    });
  }

  return hints;
}

function addressHints(facts: StakingFacts): SupportHint[] {
  const hints: SupportHint[] = [];

  if (!facts.addressTypeSupported) {
    hints.push({
      code: 'unsupported_address_type',
      severity: 'warn',
      message: `The connected address is a ${facts.addressType} address. Staking supports Taproot (bc1p), native SegWit (bc1q) and nested SegWit (3…) addresses.`,
      data: { addressType: facts.addressType },
    });
  }

  if (facts.mixedRuneUtxoCount !== null && facts.mixedRuneUtxoCount > 0) {
    hints.push({
      code: 'mixed_rune_utxo',
      severity: 'warn',
      message: `${facts.mixedRuneUtxoCount} UTXO(s) at the connected address hold LIQ together with other runes. Staking only spends LIQ from UTXOs that hold LIQ alone, so that LIQ can't be staked until it is moved into its own UTXO.`,
      data: { count: facts.mixedRuneUtxoCount },
    });
  }

  return hints;
}

/** Deterministic, customer-safe checks over the loaded facts. */
export function computeHints(facts: StakingFacts, nowMs: number): SupportHint[] {
  return [...stakeHints(facts, nowMs), ...unstakeHints(facts, nowMs), ...addressHints(facts)];
}
