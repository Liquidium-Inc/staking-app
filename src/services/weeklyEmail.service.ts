import Big from 'big.js';

import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { computeApyFromHistoric } from '@/lib/apy';
import { binarySearch } from '@/lib/binarySearch';
import {
  computeEarnings,
  INSUFFICIENT_EARNINGS_SLOTS_MESSAGE,
  isInsufficientEarningsSlotsError,
} from '@/lib/earnings';
import { logger } from '@/lib/logger';
import { canister } from '@/providers/canister';
import { emailService } from '@/providers/email';
import { runeProvider } from '@/providers/rune-provider';
import { resolveRunePriceUsd } from '@/services/rune-price';

export interface WeeklyEmailUser {
  address: string;
  email: string;
}

export interface WeeklyEmailRunResult {
  success: boolean;
  totalUsers: number;
  emailsSent: number;
  emailsSkipped: number;
  totalRewardsDistributed: number;
}

type HistoricBalances = Array<{ timestamp: Date; block: number; balance: string; staked: string }>;

type WeeklyEarningsContext = {
  historic: HistoricBalances;
  rates: Array<{ timestamp: Date; block: number; rate: Big }>;
  evaluationTimestamp: number;
  sevenDaysAgoTimestamp: number;
  earningsByAddress: Map<string, Promise<Big | null>>;
  currentRawBalancesByAddress: Map<string, Promise<Big>>;
};

const WEEKLY_EARNINGS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const RECENT_WEEKLY_ACTIVITY_COUNT = 1000;
export const MAX_WEEKLY_ACTIVITY_HISTORY_COUNT = 5000;
export const WEEKLY_EARNINGS_CONCURRENCY = 5;
const ACTIVITY_DIRECTION = {
  input: -1,
  output: 1,
} as const;

/**
 * Returns whether an activity page may be truncated because it exactly filled the requested count.
 */
function isPossiblyTruncatedActivityPage<T>(activity: T[], requestedCount: number): boolean {
  return activity.length === requestedCount;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***@***';
  if (local.length <= 2) {
    return `${local[0] ?? '*'}***@${domain}`;
  }
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}

/**
 * Runs async work over a list with bounded concurrency while preserving result order.
 */
async function mapWithConcurrencyLimit<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

function getExchangeRates(historic: HistoricBalances) {
  const supply = publicConfig.sRune.supply;
  const fallbackRate = new Big(1);

  return historic.reduce(
    (acc, balance: { timestamp: Date; block: number; balance: string; staked: string }) => {
      const diff = BigInt(supply) - BigInt(balance.staked);
      const rate =
        diff > 0 && Big(balance.balance).gt(0)
          ? Big(balance.balance).div(diff.toString())
          : fallbackRate;
      const previousRate = acc[acc.length - 1]?.rate;

      if (!previousRate?.eq(rate)) {
        acc.push({
          timestamp: balance.timestamp,
          block: balance.block,
          rate,
        });
      }
      return acc;
    },
    [] as { timestamp: Date; block: number; rate: Big }[],
  );
}

/**
 * Builds a single weekly earnings snapshot so every email computation uses the same rates and time cutoff.
 */
function createWeeklyEarningsContext(historic: HistoricBalances): WeeklyEarningsContext {
  const evaluationTimestamp = Date.now();

  return {
    historic,
    rates: getExchangeRates(historic),
    evaluationTimestamp,
    sevenDaysAgoTimestamp: evaluationTimestamp - WEEKLY_EARNINGS_WINDOW_MS,
    earningsByAddress: new Map<string, Promise<Big | null>>(),
    currentRawBalancesByAddress: new Map<string, Promise<Big>>(),
  };
}

/**
 * Builds the rate timeline needed to evaluate earnings at a specific point in time.
 */
function buildRateValuesAtTimestamp(
  context: WeeklyEarningsContext,
  evaluationTimestamp: number,
): Array<{ value: Big; block: number }> {
  const fallbackRate = new Big(1);
  const rateAtTimestamp =
    binarySearch(context.rates, (rate) => rate.timestamp.valueOf(), evaluationTimestamp)?.rate ??
    fallbackRate;
  const rateValues = [
    { value: fallbackRate, block: 0 },
    ...context.rates
      .filter(({ timestamp }) => timestamp.valueOf() <= evaluationTimestamp)
      .map(({ rate, timestamp }) => ({
        value: rate,
        block: timestamp.valueOf(),
      })),
  ];

  if (rateValues[rateValues.length - 1]?.block !== evaluationTimestamp) {
    rateValues.push({ value: rateAtTimestamp, block: evaluationTimestamp });
  }

  return rateValues;
}

/**
 * Computes weekly earnings by comparing full-history earnings now versus seven days ago.
 */
function calculateEarningsFromActivity(
  activity: Array<{
    timestamp: string;
    rune_id: string;
    amount: string;
    decimals: number;
    event_type: string;
  }>,
  context: WeeklyEarningsContext,
) {
  const values = activity
    .filter((tx) => tx.rune_id === publicConfig.sRune.id)
    .map((tx) => {
      const mult = ACTIVITY_DIRECTION[tx.event_type as keyof typeof ACTIVITY_DIRECTION] ?? 0;
      const value = Big(tx.amount).div(Big(10).pow(tx.decimals)).times(mult);
      return { value, block: new Date(tx.timestamp).valueOf() };
    })
    .reverse();
  const currentValues = values.filter(({ block }) => block <= context.evaluationTimestamp);
  const currentEarnings = computeEarnings(
    currentValues,
    buildRateValuesAtTimestamp(context, context.evaluationTimestamp),
  );
  const baselineEarnings = computeEarnings(
    currentValues.filter(({ block }) => block <= context.sevenDaysAgoTimestamp),
    buildRateValuesAtTimestamp(context, context.sevenDaysAgoTimestamp),
  );

  return currentEarnings.total.minus(baselineEarnings.total);
}

/**
 * Loads and caches the current raw sLIQ balance so recent activity can be validated cheaply.
 */
async function getCurrentRawBalance(address: string, context: WeeklyEarningsContext): Promise<Big> {
  const cached = context.currentRawBalancesByAddress.get(address);
  if (cached) {
    return cached;
  }

  const balancePromise = (async () => {
    try {
      const { data: balances } = await runeProvider.runes.walletBalances({ address });
      const balance = balances.find((item) => item.rune_id === publicConfig.sRune.id);

      return Big(balance?.total_balance ?? 0);
    } catch (error) {
      context.currentRawBalancesByAddress.delete(address);
      throw error;
    }
  })();

  context.currentRawBalancesByAddress.set(address, balancePromise);
  return balancePromise;
}

/**
 * Sums raw sLIQ transfers so the recent activity window can be compared to the live wallet balance.
 */
function getRawBalanceFromActivity(
  activity: Array<{
    rune_id: string;
    amount: string;
    event_type: string;
  }>,
): Big {
  return activity
    .filter((tx) => tx.rune_id === publicConfig.sRune.id)
    .reduce((balance, tx) => {
      const direction = ACTIVITY_DIRECTION[tx.event_type as keyof typeof ACTIVITY_DIRECTION] ?? 0;
      return balance.plus(Big(tx.amount).times(direction));
    }, new Big(0));
}

/**
 * Verifies that the recent slice fully reconstructs the user's current sLIQ balance.
 */
async function recentActivityExplainsCurrentBalance(
  address: string,
  recentActivity: Array<{
    rune_id: string;
    amount: string;
    event_type: string;
  }>,
  context: WeeklyEarningsContext,
): Promise<boolean> {
  const currentRawBalance = await getCurrentRawBalance(address, context);
  const reconstructedRawBalance = getRawBalanceFromActivity(recentActivity);

  return reconstructedRawBalance.eq(currentRawBalance);
}

/**
 * Calculates weekly earnings using a recent-window fetch first, then a bounded history fallback.
 */
async function calculateBoundedWeeklyEarnings(
  address: string,
  context: WeeklyEarningsContext,
): Promise<Big> {
  const recentQuery = {
    address,
    rune_id: publicConfig.sRune.id,
    count: RECENT_WEEKLY_ACTIVITY_COUNT,
    newerThan: new Date(context.sevenDaysAgoTimestamp),
  };

  const { data: recentActivity } = await runeProvider.runes.walletActivity(recentQuery);
  const recentActivityMatchesCurrentBalance = await recentActivityExplainsCurrentBalance(
    address,
    recentActivity,
    context,
  );

  if (
    !isPossiblyTruncatedActivityPage(recentActivity, recentQuery.count) &&
    recentActivityMatchesCurrentBalance
  ) {
    try {
      return calculateEarningsFromActivity(recentActivity, context);
    } catch (error) {
      if (!isInsufficientEarningsSlotsError(error)) {
        throw error;
      }
    }
  }

  const { data: boundedHistoryActivity } = await runeProvider.runes.walletActivity({
    address,
    rune_id: publicConfig.sRune.id,
    count: MAX_WEEKLY_ACTIVITY_HISTORY_COUNT,
  });

  if (isPossiblyTruncatedActivityPage(boundedHistoryActivity, MAX_WEEKLY_ACTIVITY_HISTORY_COUNT)) {
    throw new Error(
      `${INSUFFICIENT_EARNINGS_SLOTS_MESSAGE}: wallet activity hit the bounded weekly history limit`,
    );
  }

  return calculateEarningsFromActivity(boundedHistoryActivity, context);
}

/**
 * Loads a user's staking activity and returns their weekly earnings when reconstruction succeeds.
 */
async function calculateUserEarnings(
  address: string,
  context: WeeklyEarningsContext,
): Promise<Big | null> {
  const cached = context.earningsByAddress.get(address);
  if (cached) {
    return cached;
  }

  const earningsPromise = (async (): Promise<Big | null> => {
    try {
      return await calculateBoundedWeeklyEarnings(address, context);
    } catch (error) {
      if (isInsufficientEarningsSlotsError(error)) {
        logger.warn(`Skipping weekly earnings for address ${address}: ${error.message}`, error);
      } else {
        context.earningsByAddress.delete(address);
        logger.error(`Failed to calculate weekly earnings for address ${address}:`, error);
      }

      return null;
    }
  })();

  context.earningsByAddress.set(address, earningsPromise);
  return earningsPromise;
}

function getProtocolApy(context: WeeklyEarningsContext): {
  yearly: number;
  monthly: number;
  daily: number;
} {
  try {
    return computeApyFromHistoric(
      context.rates.map(({ rate, ...entry }) => ({
        ...entry,
        rate: rate.toNumber(),
      })),
    );
  } catch (error) {
    logger.error('Failed to calculate APY:', error);
    return { yearly: 0, monthly: 0, daily: 0 };
  }
}

async function calculateTotalRewardsDistributed(
  users: WeeklyEmailUser[],
  context: WeeklyEarningsContext,
): Promise<Big> {
  try {
    const earningsByUser = await mapWithConcurrencyLimit(
      users,
      WEEKLY_EARNINGS_CONCURRENCY,
      async (user) => calculateUserEarnings(user.address, context),
    );

    return earningsByUser.reduce<Big>((totalRewards, earnings) => {
      if (earnings === null) {
        return totalRewards;
      }

      return totalRewards.plus(earnings);
    }, new Big(0));
  } catch (error) {
    logger.error('Failed to calculate total rewards distributed:', error);
    return new Big(0);
  }
}

async function getProtocolData(
  context: WeeklyEarningsContext,
): Promise<[number, number, { yearly: number; monthly: number; daily: number }]> {
  const settled = await Promise.allSettled([
    canister.getExchangeRateDecimal(),
    resolveRunePriceUsd({ runeName: publicConfig.rune.name }),
  ]);

  type SettledResult<T> = PromiseSettledResult<T>;
  const pick = <T>(i: number): T | undefined =>
    (settled[i] as SettledResult<T>).status === 'fulfilled'
      ? (settled[i] as PromiseFulfilledResult<T>).value
      : undefined;

  const defaultRateDecimal = 1;
  const defaultTokenPrice = 0;
  const apy = getProtocolApy(context);

  return [pick<number>(0) ?? defaultRateDecimal, pick<number>(1) ?? defaultTokenPrice, apy];
}

async function processUserEmail(
  user: WeeklyEmailUser,
  tokenPrice: number,
  exchangeRate: number,
  apy: number,
  totalRewardsDistributed: Big,
  context: WeeklyEarningsContext,
): Promise<{ success: boolean; skipped: boolean }> {
  try {
    const sLiqAmountBig = (await getCurrentRawBalance(user.address, context)).div(
      Big(10).pow(publicConfig.sRune.decimals),
    );
    const apyBig = Big(apy);
    const tokenPriceBig = Big(tokenPrice);

    if (sLiqAmountBig.lte(0)) {
      return { success: false, skipped: true };
    }

    const earnedLiq = await calculateUserEarnings(user.address, context);
    if (earnedLiq === null) {
      return { success: false, skipped: true };
    }

    const stakedValueBig = sLiqAmountBig.times(exchangeRate).times(tokenPriceBig);

    const emailTemplate = await emailService.generateWeeklyReportEmail({
      address: user.address,
      email: user.email,
      sLiqBalance: sLiqAmountBig,
      earnedLiq,
      apy: apyBig,
      totalRewardsDistributed,
      stakedValue: stakedValueBig,
    });

    const result = await emailService.sendEmail(user.email, emailTemplate);

    if (result.success) {
      logger.info(`Weekly email sent to ${maskEmail(user.email)}`);
      return { success: true, skipped: false };
    } else {
      logger.error(`Failed to send weekly email to ${maskEmail(user.email)}:`, result.error);
      return { success: false, skipped: true };
    }
  } catch (error) {
    logger.error(`Error processing user ${user.address}:`, error);
    return { success: false, skipped: true };
  }
}

export async function runWeeklyEmailCron(): Promise<WeeklyEmailRunResult> {
  logger.info('Starting weekly email cron job');

  await db.emailSubscription.deleteExpiredTokens();
  const users = await db.emailSubscription.getActiveVerifiedUsers();

  logger.info(`Found ${users.length} verified users`);
  if (users.length === 0) {
    return {
      success: true,
      totalUsers: 0,
      emailsSent: 0,
      emailsSkipped: 0,
      totalRewardsDistributed: 0,
    };
  }

  let historic: HistoricBalances;
  try {
    historic = await db.poolBalance.getHistoric();
  } catch (error) {
    logger.error('db.poolBalance.getHistoric failed for weekly email:', error);
    throw error;
  }
  const context = createWeeklyEarningsContext(historic);
  const [rateDecimal, tokenPrice, apy] = await getProtocolData(context);

  const exchangeRate =
    rateDecimal && Number.isFinite(rateDecimal) && rateDecimal > 0 ? rateDecimal : 1;

  const totalRewardsDistributed = await calculateTotalRewardsDistributed(users, context);
  logger.info(
    `Total rewards distributed in last 7 days: ${totalRewardsDistributed.toString()} LIQ`,
  );

  let emailsSent = 0;
  let emailsSkipped = 0;

  for (const user of users) {
    const result = await processUserEmail(
      user,
      tokenPrice,
      exchangeRate,
      apy.yearly,
      totalRewardsDistributed,
      context,
    );

    if (result.success) emailsSent++;
    else emailsSkipped++;

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.info(`Weekly email cron job completed. Sent: ${emailsSent}, Skipped: ${emailsSkipped}`);

  return {
    success: true,
    totalUsers: users.length,
    emailsSent,
    emailsSkipped,
    totalRewardsDistributed: totalRewardsDistributed.toNumber(),
  };
}
