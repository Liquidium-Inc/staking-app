import { describe, expect, it } from 'vitest';

import { BitcoinAddressType } from '@/lib/address';

import {
  MIN_FEE_BALANCE_SATS,
  PENDING_MONITOR_WINDOW_MS,
  STAKE_UNCONFIRMED_LONG_MS,
  computeHints,
} from './hints';
import { TxChainState, type StakeFact, type StakingFacts, type UnstakeFact } from './types';

const NOW_MS = 1_760_000_000_000;
const HOUR_MS = 60 * 60 * 1000;
const WITHDRAW_TIME_MS = 7 * 24 * HOUR_MS;
const TXID = 'a'.repeat(64);
const CLAIM_TXID = 'c'.repeat(64);
const HOUR_FEE_RATE = 10;

function facts(overrides: Partial<StakingFacts> = {}): StakingFacts {
  return {
    address: 'bc1pexample',
    addressType: BitcoinAddressType.P2TR,
    addressTypeSupported: true,
    liqBalance: '0',
    sliqBalance: '0',
    btcSats: BigInt(50_000),
    mixedRuneUtxoCount: 0,
    exchangeRate: 1.1,
    hourFeeRate: HOUR_FEE_RATE,
    withdrawTimeMs: WITHDRAW_TIME_MS,
    stakes: [],
    unstakes: [],
    recentActivity: [],
    unavailable: [],
    ...overrides,
  };
}

function stake(overrides: Partial<StakeFact> = {}): StakeFact {
  return {
    txid: TXID,
    amount: '100',
    sAmount: '90',
    createdAtMs: NOW_MS - HOUR_MS,
    recordedConfirmed: false,
    chain: { state: TxChainState.Unconfirmed },
    feeRate: HOUR_FEE_RATE,
    ...overrides,
  };
}

function unstake(overrides: Partial<UnstakeFact> = {}): UnstakeFact {
  return {
    txid: TXID,
    amount: '100',
    sAmount: '90',
    createdAtMs: NOW_MS - 2 * HOUR_MS,
    recordedConfirmed: true,
    chain: { state: TxChainState.Confirmed, blockTimeMs: NOW_MS - HOUR_MS, blockHeight: 900_000 },
    claimTx: null,
    claimChain: null,
    ...overrides,
  };
}

const codes = (input: StakingFacts) => computeHints(input, NOW_MS).map((hint) => hint.code);

describe('staking support hints', () => {
  it('returns no hints for a healthy account', () => {
    expect(computeHints(facts({ stakes: [stake()] }), NOW_MS)).toEqual([]);
  });

  it('flags a long-unconfirmed stake at a low fee rate without escalating', () => {
    const [hint] = computeHints(
      facts({
        stakes: [stake({ createdAtMs: NOW_MS - STAKE_UNCONFIRMED_LONG_MS - HOUR_MS, feeRate: 2 })],
      }),
      NOW_MS,
    );

    expect(hint).toMatchObject({
      code: 'stake_unconfirmed_long',
      escalate: false,
      data: { lowFeeRate: true, feeRate: 2, currentHourFeeRate: HOUR_FEE_RATE },
    });
    expect(hint.message).toContain('25h at 2 sat/vB');
  });

  it('escalates a long-unconfirmed stake whose fee rate was adequate', () => {
    const [hint] = computeHints(
      facts({ stakes: [stake({ createdAtMs: NOW_MS - STAKE_UNCONFIRMED_LONG_MS - HOUR_MS })] }),
      NOW_MS,
    );
    expect(hint).toMatchObject({ code: 'stake_unconfirmed_long', escalate: true });
  });

  it('ignores stake rows that never reached the network', () => {
    const abandoned = stake({
      createdAtMs: NOW_MS - PENDING_MONITOR_WINDOW_MS - HOUR_MS,
      chain: { state: TxChainState.NotFound },
    });
    expect(codes(facts({ stakes: [abandoned] }))).toEqual([]);
  });

  it('escalates rows older than the monitor window', () => {
    const old = NOW_MS - PENDING_MONITOR_WINDOW_MS - HOUR_MS;
    const hints = computeHints(
      facts({
        stakes: [
          stake({
            createdAtMs: old,
            chain: { state: TxChainState.Confirmed, blockTimeMs: old, blockHeight: 1 },
          }),
        ],
        unstakes: [unstake({ createdAtMs: old, recordedConfirmed: false, claimTx: CLAIM_TXID })],
      }),
      NOW_MS,
    );

    expect(hints.filter((hint) => hint.code === 'pending_past_monitor_window')).toHaveLength(2);
    expect(hints.every((hint) => hint.escalate)).toBe(true);
  });

  it('reports an active cooldown with unlockAt', () => {
    const [hint] = computeHints(facts({ unstakes: [unstake()] }), NOW_MS);

    expect(hint).toMatchObject({
      code: 'unstake_cooldown_active',
      data: { txid: TXID, unlockAt: NOW_MS - HOUR_MS + WITHDRAW_TIME_MS },
    });
  });

  it('reports a withdrawable unclaimed unstake and missing fee BTC', () => {
    const confirmedAt = NOW_MS - WITHDRAW_TIME_MS - HOUR_MS;
    const withdrawable = unstake({
      chain: { state: TxChainState.Confirmed, blockTimeMs: confirmedAt, blockHeight: 1 },
    });

    expect(codes(facts({ unstakes: [withdrawable] }))).toEqual(['unstake_withdrawable_unclaimed']);
    expect(
      codes(facts({ unstakes: [withdrawable], btcSats: MIN_FEE_BALANCE_SATS - BigInt(1) })),
    ).toEqual(['unstake_withdrawable_unclaimed', 'no_btc_for_fees']);
  });

  it('does not treat a claimed unstake as withdrawable', () => {
    const confirmedAt = NOW_MS - WITHDRAW_TIME_MS - HOUR_MS;
    const claimed = unstake({
      chain: { state: TxChainState.Confirmed, blockTimeMs: confirmedAt, blockHeight: 1 },
      claimTx: CLAIM_TXID,
      claimChain: { state: TxChainState.Unconfirmed },
    });
    expect(codes(facts({ unstakes: [claimed], btcSats: BigInt(0) }))).toEqual([]);
  });

  it('flags unsupported address types and mixed rune UTXOs', () => {
    expect(
      codes(
        facts({
          addressType: BitcoinAddressType.P2PKH,
          addressTypeSupported: false,
          mixedRuneUtxoCount: 2,
        }),
      ),
    ).toEqual(['unsupported_address_type', 'mixed_rune_utxo']);
  });
});
