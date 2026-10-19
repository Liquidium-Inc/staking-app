import axios from 'axios';
import Big from 'big.js';

import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { SUPPORTED_ADDRESS_TYPES, getBitcoinAddressType } from '@/lib/address';
import { mapWithConcurrencyLimit } from '@/lib/async';
import { logger } from '@/lib/logger';
import { canister } from '@/providers/canister';
import { mempool } from '@/providers/mempool';
import { MAX_WALLET_ACTIVITY_RESULTS, runeProvider } from '@/providers/rune-provider';
import { getPortfolioActivity } from '@/services/portfolioActivity.service';

import {
  MS_PER_SECOND,
  SUPPORT_HISTORY_LIMIT,
  SUPPORT_RECENT_ACTIVITY_LIMIT,
  SUPPORT_SUMMARY_ITEM_LIMIT,
  SUPPORT_UNSETTLED_LOOKUP_LIMIT,
} from './constants';
import {
  StakeState,
  TxChainState,
  UnstakeState,
  type ActivityFact,
  type KindTotals,
  type StakeFact,
  type StakingFacts,
  type TxChainStatus,
  type UnstakeFact,
} from './types';

const MEMPOOL_LOOKUP_CONCURRENCY = 4;
const HTTP_NOT_FOUND = 404;
const WEIGHT_UNITS_PER_VBYTE = 4;

type TxWithStatus = {
  fee?: number;
  weight?: number;
  status: { confirmed: boolean; block_time?: number; block_height?: number };
};

function toChainStatus(status: TxWithStatus['status']): TxChainStatus {
  if (status.confirmed && status.block_time !== undefined && status.block_height !== undefined) {
    return {
      state: TxChainState.Confirmed,
      blockTimeMs: status.block_time * MS_PER_SECOND,
      blockHeight: status.block_height,
    };
  }
  return { state: TxChainState.Unconfirmed };
}

function failedLookupStatus(error: unknown): TxChainStatus {
  if (axios.isAxiosError(error) && error.response?.status === HTTP_NOT_FOUND) {
    return { state: TxChainState.NotFound };
  }
  return { state: TxChainState.Unknown };
}

export async function fetchTxChainStatus(txid: string): Promise<TxChainStatus> {
  try {
    return toChainStatus(await mempool.transactions.getTxStatus({ txid }));
  } catch (error) {
    return failedLookupStatus(error);
  }
}

async function fetchTxWithFeeRate(
  txid: string,
): Promise<{ chain: TxChainStatus; feeRate: number | null }> {
  try {
    const tx = (await mempool.transactions.getTx({ txid })) as TxWithStatus;
    const feeRate =
      tx.fee !== undefined && tx.weight
        ? Number(new Big(tx.fee).div(tx.weight / WEIGHT_UNITS_PER_VBYTE).toFixed(1))
        : null;
    return { chain: toChainStatus(tx.status), feeRate };
  } catch (error) {
    return { chain: failedLookupStatus(error), feeRate: null };
  }
}

function toDecimal(raw: string | number | null | undefined, decimals: number) {
  if (raw === null || raw === undefined) return '0';
  return new Big(raw).div(new Big(10).pow(decimals)).toString();
}

/** Runs a provider read; on failure records the section as unavailable and returns null. */
async function optional<T>(
  section: string,
  unavailable: string[],
  read: () => Promise<T>,
): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    unavailable.push(section);
    logger.warn('support: provider read failed', {
      section,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

const UNKNOWN_CHAIN: TxChainStatus = { state: TxChainState.Unknown };

/** One list kind's full history for an address, newest first. */
export type History<T> = {
  items: T[];
  // False when the history was longer than we read.
  totalExact: boolean;
  // False when some unsettled rows couldn't be checked on chain, so their state is a best guess.
  statesExact: boolean;
};

function settledOr<T>(result: PromiseSettledResult<T> | undefined, fallback: T) {
  return result?.status === 'fulfilled' ? result.value : fallback;
}

/** Every stake of the address (capped); only unsettled rows are checked on chain. */
export async function loadStakeHistory(address: string): Promise<History<StakeFact>> {
  const rows = await db.stake.getRecentOf(address, SUPPORT_HISTORY_LIMIT + 1);
  const kept = rows.slice(0, SUPPORT_HISTORY_LIMIT);
  const unsettled = kept.filter((row) => row.block === null);
  const checked = unsettled.slice(0, SUPPORT_UNSETTLED_LOOKUP_LIMIT);
  const lookups = await mapWithConcurrencyLimit(checked, MEMPOOL_LOOKUP_CONCURRENCY, (row) =>
    fetchTxWithFeeRate(row.txid),
  );
  const unresolved = { chain: UNKNOWN_CHAIN, feeRate: null };
  const lookupById = new Map(
    checked.map((row, index) => [row.id, settledOr(lookups[index], unresolved)]),
  );

  const items = kept.map((row): StakeFact => {
    const { chain, feeRate } = lookupById.get(row.id) ?? unresolved;
    const recordedConfirmed = row.block !== null;
    return {
      id: row.id,
      state: recordedConfirmed
        ? StakeState.Confirmed
        : chain.state === TxChainState.NotFound
          ? StakeState.NotBroadcast
          : StakeState.Pending,
      txid: row.txid,
      amount: toDecimal(row.amount, publicConfig.rune.decimals),
      sAmount: toDecimal(row.sAmount, publicConfig.sRune.decimals),
      createdAtMs: row.timestamp.getTime(),
      recordedConfirmed,
      chain,
      feeRate,
    };
  });

  return {
    items,
    totalExact: rows.length <= SUPPORT_HISTORY_LIMIT,
    statesExact:
      checked.length === unsettled.length &&
      [...lookupById.values()].every(({ chain }) => chain.state !== TxChainState.Unknown),
  };
}

/** Every unstake of the address (capped); only unsettled, unclaimed rows are checked on chain. */
export async function loadUnstakeHistory(address: string): Promise<History<UnstakeFact>> {
  const rows = await db.unstake.getRecentOf(address, SUPPORT_HISTORY_LIMIT + 1);
  const kept = rows.slice(0, SUPPORT_HISTORY_LIMIT);
  const unsettled = kept.filter((row) => row.block === null && !row.claimTx);
  const checked = unsettled.slice(0, SUPPORT_UNSETTLED_LOOKUP_LIMIT);
  const lookups = await mapWithConcurrencyLimit(checked, MEMPOOL_LOOKUP_CONCURRENCY, (row) =>
    fetchTxChainStatus(row.txid),
  );
  const chainById = new Map(
    checked.map((row, index) => [row.id, settledOr(lookups[index], UNKNOWN_CHAIN)]),
  );

  const items = kept.map((row): UnstakeFact => {
    const chain = chainById.get(row.id) ?? UNKNOWN_CHAIN;
    return {
      id: row.id,
      state: row.claimTx
        ? UnstakeState.ClaimSubmitted
        : row.block !== null
          ? UnstakeState.Confirmed
          : chain.state === TxChainState.NotFound
            ? UnstakeState.NotBroadcast
            : UnstakeState.Pending,
      txid: row.txid,
      amount: toDecimal(row.amount, publicConfig.rune.decimals),
      sAmount: toDecimal(row.sAmount, publicConfig.sRune.decimals),
      createdAtMs: row.timestamp.getTime(),
      recordedConfirmed: row.block !== null,
      chain,
      claimTx: row.claimTx,
      claimChain: null,
    };
  });

  return {
    items,
    totalExact: rows.length <= SUPPORT_HISTORY_LIMIT,
    statesExact:
      checked.length === unsettled.length &&
      [...chainById.values()].every((chain) => chain.state !== TxChainState.Unknown),
  };
}

/** Adds the chain lookups shown on unstake items: confirmation time and claim status. */
export async function resolveUnstakeChains(unstakes: UnstakeFact[]): Promise<UnstakeFact[]> {
  const lookups = await mapWithConcurrencyLimit(
    unstakes,
    MEMPOOL_LOOKUP_CONCURRENCY,
    async (unstake) => ({
      chain:
        unstake.chain.state === TxChainState.Unknown
          ? await fetchTxChainStatus(unstake.txid)
          : unstake.chain,
      claimChain: unstake.claimTx ? await fetchTxChainStatus(unstake.claimTx) : null,
    }),
  );
  return unstakes.map((unstake, index) => ({
    ...unstake,
    ...settledOr(lookups[index], { chain: unstake.chain, claimChain: null }),
  }));
}

/** LIQ and sLIQ activity, newest first, as far back as the provider reads. */
export async function loadActivityHistory(address: string): Promise<History<ActivityFact>> {
  const tokens = [
    { id: publicConfig.rune.id, token: 'LIQ' as const },
    { id: publicConfig.sRune.id, token: 'sLIQ' as const },
  ];
  const results = await Promise.all(
    tokens.map(async ({ id, token }) => {
      const { activity, complete } = await getPortfolioActivity(
        address,
        id,
        MAX_WALLET_ACTIVITY_RESULTS,
        runeProvider,
      );
      const entries = activity.map((entry) => ({
        direction: entry.event_type === 'output' ? ('in' as const) : ('out' as const),
        token,
        amount: toDecimal(entry.amount, entry.decimals),
        outpoint: entry.outpoint,
        ts: entry.timestamp,
      }));
      return { entries, complete };
    }),
  );

  return {
    items: results
      .flatMap((result) => result.entries)
      .sort((left, right) => new Date(right.ts).valueOf() - new Date(left.ts).valueOf()),
    totalExact: results.every((result) => result.complete),
    statesExact: true,
  };
}

/** Open items first (newest first), then the most recent closed ones, capped for the summary. */
function summarySelection<T extends { state: string }>(
  items: T[],
  openStates: string[],
  closedStates: string[],
) {
  return [
    ...items.filter((item) => openStates.includes(item.state)),
    ...items.filter((item) => closedStates.includes(item.state)),
  ].slice(0, SUPPORT_SUMMARY_ITEM_LIMIT);
}

function totalsOf<T>(history: History<T> | null, stateOf?: (item: T) => string): KindTotals {
  if (!history) return { total: null, totalExact: false };
  const totals: KindTotals = { total: history.items.length, totalExact: history.totalExact };
  if (stateOf) {
    const byState: Record<string, number> = {};
    for (const item of history.items) byState[stateOf(item)] = (byState[stateOf(item)] ?? 0) + 1;
    totals.byState = byState;
    totals.byStateExact = history.totalExact && history.statesExact;
  }
  return totals;
}

export async function hasStakingActivity(address: string) {
  const [stakes, unstakes] = await Promise.all([
    db.stake.getRecentOf(address, 1),
    db.unstake.getRecentOf(address, 1),
  ]);
  return stakes.length > 0 || unstakes.length > 0;
}

/** Loads every fact the support context needs for one verified address. */
export async function loadStakingFacts(address: string): Promise<StakingFacts> {
  const unavailable: string[] = [];
  const addressType = getBitcoinAddressType(address);

  const [stakeHistory, unstakeHistory, balances, cardinal, runic, rate, fees, activityHistory] =
    await Promise.all([
      loadStakeHistory(address),
      loadUnstakeHistory(address),
      optional('balances', unavailable, () => runeProvider.runes.walletBalances({ address })),
      optional('btcBalance', unavailable, () =>
        runeProvider.mempool.cardinalUTXOs({ wallet_addr: address }),
      ),
      optional('runeUtxos', unavailable, () =>
        runeProvider.mempool.runicUTXOs({ wallet_addr: address }),
      ),
      optional('exchangeRate', unavailable, () => canister.getExchangeRate()),
      optional('feeRates', unavailable, () => mempool.fees.getFeesRecommended()),
      optional('recentActivity', unavailable, () => loadActivityHistory(address)),
    ]);

  const unstakes = await resolveUnstakeChains(
    summarySelection(
      unstakeHistory.items,
      [UnstakeState.Pending, UnstakeState.Confirmed],
      [UnstakeState.ClaimSubmitted],
    ),
  );

  const balanceOf = (runeId: string, decimals: number) =>
    balances
      ? toDecimal(balances.data.find((entry) => entry.rune_id === runeId)?.total_balance, decimals)
      : null;

  return {
    address,
    addressType,
    addressTypeSupported: SUPPORTED_ADDRESS_TYPES.has(addressType),
    liqBalance: balanceOf(publicConfig.rune.id, publicConfig.rune.decimals),
    sliqBalance: balanceOf(publicConfig.sRune.id, publicConfig.sRune.decimals),
    btcSats: cardinal
      ? cardinal.data.reduce((sum, utxo) => sum + BigInt(utxo.value), BigInt(0))
      : null,
    mixedRuneUtxoCount: runic
      ? runic.data.filter(
          (utxo) =>
            Array.isArray(utxo.rune_ids) &&
            utxo.rune_ids.length > 1 &&
            utxo.rune_ids.includes(publicConfig.rune.id),
        ).length
      : null,
    exchangeRate:
      rate && rate.circulating !== BigInt(0)
        ? Number(rate.balance) / Number(rate.circulating)
        : null,
    hourFeeRate: fees?.hourFee ?? null,
    withdrawTimeMs: publicConfig.protocol.withdrawTime * MS_PER_SECOND,
    stakes: summarySelection(stakeHistory.items, [StakeState.Pending], [StakeState.Confirmed]),
    unstakes,
    recentActivity: activityHistory?.items.slice(0, SUPPORT_RECENT_ACTIVITY_LIMIT) ?? null,
    totals: {
      stakes: totalsOf(stakeHistory, (stake) => stake.state),
      unstakes: totalsOf(unstakeHistory, (unstake) => unstake.state),
      // Activity has no states; an unavailable provider leaves its total unknown.
      activity: totalsOf(activityHistory),
    },
    unavailable,
  };
}
