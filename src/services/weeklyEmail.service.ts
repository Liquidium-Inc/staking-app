import Big from 'big.js';

import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { computeApyFromHistoric } from '@/lib/apy';
import { binarySearch } from '@/lib/binarySearch';
import { computeEarnings, isInsufficientEarningsSlotsError } from '@/lib/earnings';
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
};

const WEEKLY_EARNINGS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ALL_ACTIVITY_HISTORY_COUNT = Number.MAX_SAFE_INTEGER;

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***@***';
  if (local.length <= 2) {
    return `${local[0] ?? '*'}***@${domain}`;
  }
  return `${local[0]}***${local.slice(-1)}@${domain}`;
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
  const multiplier = {
    input: -1,
    output: 1,
  } as const;

  const values = activity
    .filter((tx) => tx.rune_id === publicConfig.sRune.id)
    .map((tx) => {
      const mult = multiplier[tx.event_type as keyof typeof multiplier] ?? 0;
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
 * Loads a user's full staking activity and returns their weekly earnings when reconstruction succeeds.
 */
async function calculateUserEarnings(
  address: string,
  context: WeeklyEarningsContext,
): Promise<Big | null> {
  try {
    const { data: activity } = await runeProvider.runes.walletActivity({
      address,
      rune_id: publicConfig.sRune.id,
      count: ALL_ACTIVITY_HISTORY_COUNT,
    });

    return calculateEarningsFromActivity(activity, context);
  } catch (error) {
    if (isInsufficientEarningsSlotsError(error)) {
      logger.warn(`Skipping weekly earnings for address ${address}: ${error.message}`, error);
    } else {
      logger.error(`Failed to calculate weekly earnings for address ${address}:`, error);
    }

    return null;
  }
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
    let totalRewards = new Big(0);

    for (const user of users) {
      const earnings = await calculateUserEarnings(user.address, context);

      if (earnings !== null) {
        totalRewards = totalRewards.plus(earnings);
      }
    }

    return totalRewards;
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
    const { data: balance } = await runeProvider.runes.walletBalances({ address: user.address });

    const sLiqBalance = balance.find((b) => b.rune_id === publicConfig.sRune.id);
    const sLiqAmountBig = sLiqBalance
      ? Big(sLiqBalance.total_balance).div(Big(10).pow(publicConfig.sRune.decimals))
      : Big(0);
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

  const historic = await db.poolBalance.getHistoric().catch((error: unknown) => {
    logger.error('Failed to load historic pool balances for weekly email:', error);
    return [] as HistoricBalances;
  });
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
