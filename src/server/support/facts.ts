import axios from 'axios';
import Big from 'big.js';

import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { SUPPORTED_ADDRESS_TYPES, getBitcoinAddressType } from '@/lib/address';
import { mapWithConcurrencyLimit } from '@/lib/async';
import { logger } from '@/lib/logger';
import { canister } from '@/providers/canister';
import { mempool } from '@/providers/mempool';
import { runeProvider } from '@/providers/rune-provider';
import { getPortfolioActivity } from '@/services/portfolioActivity.service';

import {
  MS_PER_SECOND,
  SUPPORT_RECENT_ACTIVITY_LIMIT,
  SUPPORT_SUMMARY_ITEM_LIMIT,
} from './constants';
import {
  TxChainState,
  type ActivityFact,
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

export async function loadStakes(address: string): Promise<StakeFact[]> {
  const rows = await db.stake.getRecentOf(address, SUPPORT_SUMMARY_ITEM_LIMIT);
  const lookups = await mapWithConcurrencyLimit(rows, MEMPOOL_LOOKUP_CONCURRENCY, (row) =>
    row.block === null
      ? fetchTxWithFeeRate(row.txid)
      : Promise.resolve({ chain: { state: TxChainState.Unknown } as TxChainStatus, feeRate: null }),
  );

  return rows.map((row, index) => {
    const lookup = lookups[index];
    const resolved =
      lookup.status === 'fulfilled'
        ? lookup.value
        : { chain: { state: TxChainState.Unknown } as TxChainStatus, feeRate: null };
    return {
      txid: row.txid,
      amount: toDecimal(row.amount, publicConfig.rune.decimals),
      sAmount: toDecimal(row.sAmount, publicConfig.sRune.decimals),
      createdAtMs: row.timestamp.getTime(),
      recordedConfirmed: row.block !== null,
      chain: resolved.chain,
      feeRate: resolved.feeRate,
    };
  });
}

export async function loadUnstakes(address: string): Promise<UnstakeFact[]> {
  const rows = await db.unstake.getRecentOf(address, SUPPORT_SUMMARY_ITEM_LIMIT);
  const lookups = await mapWithConcurrencyLimit(rows, MEMPOOL_LOOKUP_CONCURRENCY, async (row) => ({
    chain: await fetchTxChainStatus(row.txid),
    claimChain: row.claimTx ? await fetchTxChainStatus(row.claimTx) : null,
  }));

  return rows.map((row, index) => {
    const lookup = lookups[index];
    const resolved =
      lookup.status === 'fulfilled'
        ? lookup.value
        : { chain: { state: TxChainState.Unknown } as TxChainStatus, claimChain: null };
    return {
      txid: row.txid,
      amount: toDecimal(row.amount, publicConfig.rune.decimals),
      sAmount: toDecimal(row.sAmount, publicConfig.sRune.decimals),
      createdAtMs: row.timestamp.getTime(),
      recordedConfirmed: row.block !== null,
      chain: resolved.chain,
      claimTx: row.claimTx,
      claimChain: resolved.claimChain,
    };
  });
}

async function loadRecentActivity(address: string): Promise<ActivityFact[]> {
  const tokens = [
    { id: publicConfig.rune.id, token: 'LIQ' as const },
    { id: publicConfig.sRune.id, token: 'sLIQ' as const },
  ];
  const results = await Promise.all(
    tokens.map(async ({ id, token }) => {
      const { activity } = await getPortfolioActivity(
        address,
        id,
        SUPPORT_RECENT_ACTIVITY_LIMIT,
        runeProvider,
      );
      return activity.map((entry) => ({
        direction: entry.event_type === 'output' ? ('in' as const) : ('out' as const),
        token,
        amount: toDecimal(entry.amount, entry.decimals),
        outpoint: entry.outpoint,
        ts: entry.timestamp,
      }));
    }),
  );

  return results
    .flat()
    .sort((left, right) => new Date(right.ts).valueOf() - new Date(left.ts).valueOf())
    .slice(0, SUPPORT_RECENT_ACTIVITY_LIMIT);
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

  const [stakes, unstakes, balances, cardinal, runic, rate, fees, recentActivity] =
    await Promise.all([
      loadStakes(address),
      loadUnstakes(address),
      optional('balances', unavailable, () => runeProvider.runes.walletBalances({ address })),
      optional('btcBalance', unavailable, () =>
        runeProvider.mempool.cardinalUTXOs({ wallet_addr: address }),
      ),
      optional('runeUtxos', unavailable, () =>
        runeProvider.mempool.runicUTXOs({ wallet_addr: address }),
      ),
      optional('exchangeRate', unavailable, () => canister.getExchangeRate()),
      optional('feeRates', unavailable, () => mempool.fees.getFeesRecommended()),
      optional('recentActivity', unavailable, () => loadRecentActivity(address)),
    ]);

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
    stakes,
    unstakes,
    recentActivity,
    unavailable,
  };
}
