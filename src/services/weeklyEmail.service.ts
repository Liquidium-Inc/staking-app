import Big from 'big.js';

import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { computeApyFromHistoric } from '@/lib/apy';
import { computeEarnings } from '@/lib/earnings';
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
  rates: Array<{ timestamp: Date; block: number; rate: number }>;
  sevenDaysAgoTimestamp: number;
};

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

  return historic.reduce(
    (acc, balance: { timestamp: Date; block: number; balance: string; staked: string }) => {
      const diff = BigInt(supply) - BigInt(balance.staked);
      const rate =
        diff > 0 && Big(balance.balance).gt(0)
          ? Big(balance.balance).div(diff.toString()).toNumber()
          : 1;

      if (acc[acc.length - 1]?.rate !== rate) {
        acc.push({
          timestamp: balance.timestamp,
          block: balance.block,
          rate,
        });
      }
      return acc;
    },
    [] as { timestamp: Date; block: number; rate: number }[],
  );
}

/**
 * Builds a single weekly earnings snapshot so every email computation uses the same rates and time cutoff.
 */
function createWeeklyEarningsContext(historic: HistoricBalances): WeeklyEarningsContext {
  return {
    historic,
    rates: getExchangeRates(historic),
    sevenDaysAgoTimestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
  };
}

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
    .filter(
      (tx) =>
        new Date(tx.timestamp).valueOf() >= context.sevenDaysAgoTimestamp &&
        tx.rune_id === publicConfig.sRune.id,
    )
    .map((tx) => {
      const mult = multiplier[tx.event_type as keyof typeof multiplier] ?? 0;
      const value = Big(tx.amount).div(Big(10).pow(tx.decimals)).times(mult).toNumber();
      return { value, block: new Date(tx.timestamp).valueOf() };
    })
    .reverse();

  const rateValues = [
    { value: 1, block: 0 },
    ...context.rates.map(({ rate, timestamp }: { rate: number; timestamp: Date }) => ({
      value: rate,
      block: timestamp.valueOf(),
    })),
    { value: context.rates[context.rates.length - 1]?.rate ?? 1, block: Number.POSITIVE_INFINITY },
  ];

  return computeEarnings(values, rateValues);
}

async function calculateUserEarnings(
  address: string,
  context: WeeklyEarningsContext,
): Promise<number> {
  try {
    const { data: activity } = await runeProvider.runes.walletActivity({
      address,
      rune_id: publicConfig.sRune.id,
      count: 1000,
      newerThan: new Date(context.sevenDaysAgoTimestamp),
    });

    const earnings = calculateEarningsFromActivity(activity, context);

    return earnings.total;
  } catch (error) {
    logger.error(`Failed to calculate earnings for address ${address}:`, error);
    return 0;
  }
}

function getProtocolApy(context: WeeklyEarningsContext): {
  yearly: number;
  monthly: number;
  daily: number;
} {
  try {
    return computeApyFromHistoric(context.rates);
  } catch (error) {
    logger.error('Failed to calculate APY:', error);
    return { yearly: 0, monthly: 0, daily: 0 };
  }
}

async function calculateTotalRewardsDistributed(
  users: WeeklyEmailUser[],
  context: WeeklyEarningsContext,
): Promise<number> {
  try {
    let totalRewards = new Big(0);

    for (const user of users) {
      try {
        const { data: activity } = await runeProvider.runes.walletActivity({
          address: user.address,
          rune_id: publicConfig.sRune.id,
          count: 1000,
          newerThan: new Date(context.sevenDaysAgoTimestamp),
        });
        const earnings = calculateEarningsFromActivity(activity, context);
        totalRewards = totalRewards.plus(earnings.total);
      } catch (error) {
        logger.warn(`Failed to calculate rewards for user ${user.address}:`, error);
      }
    }

    return totalRewards.toNumber();
  } catch (error) {
    logger.error('Failed to calculate total rewards distributed:', error);
    return 0;
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
  totalRewardsDistributed: number,
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
  logger.info(`Total rewards distributed in last 7 days: ${totalRewardsDistributed} LIQ`);

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
    totalRewardsDistributed,
  };
}
