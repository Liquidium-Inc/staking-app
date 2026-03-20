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

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***@***';
  if (local.length <= 2) {
    return `${local[0] ?? '*'}***@${domain}`;
  }
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}

function getExchangeRates(
  historic: Array<{ timestamp: Date; block: number; balance: string; staked: string }>,
) {
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

function calculateEarningsFromActivity(
  activity: Array<{
    timestamp: string;
    rune_id: string;
    amount: string;
    decimals: number;
    event_type: string;
  }>,
  sevenDaysAgoTimestamp: number,
  rates: Array<{ timestamp: Date; block: number; rate: number }>,
) {
  const multiplier = {
    input: -1,
    output: 1,
  } as const;

  const values = activity
    .filter(
      (tx) =>
        new Date(tx.timestamp).valueOf() >= sevenDaysAgoTimestamp &&
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
    ...rates.map(({ rate, timestamp }: { rate: number; timestamp: Date }) => ({
      value: rate,
      block: timestamp.valueOf(),
    })),
    { value: rates[rates.length - 1]?.rate ?? 1, block: Number.POSITIVE_INFINITY },
  ];

  return computeEarnings(values, rateValues);
}

async function calculateUserEarnings(address: string): Promise<number> {
  try {
    const sevenDaysAgoTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const [{ data: activity }, historic] = await Promise.all([
      runeProvider.runes.walletActivity({
        address,
        rune_id: publicConfig.sRune.id,
        count: 1000,
        newerThan: new Date(sevenDaysAgoTimestamp),
      }),
      db.poolBalance.getHistoric(),
    ]);

    const rates = getExchangeRates(historic);
    const earnings = calculateEarningsFromActivity(activity, sevenDaysAgoTimestamp, rates);

    return earnings.total;
  } catch (error) {
    logger.error(`Failed to calculate earnings for address ${address}:`, error);
    return 0;
  }
}

async function getProtocolApy(): Promise<{ yearly: number; monthly: number; daily: number }> {
  try {
    const historic = await db.poolBalance.getHistoric();
    const historicRates = getExchangeRates(historic);
    return computeApyFromHistoric(historicRates);
  } catch (error) {
    logger.error('Failed to calculate APY:', error);
    return { yearly: 0, monthly: 0, daily: 0 };
  }
}

async function calculateTotalRewardsDistributed(
  users: WeeklyEmailUser[],
  historic: Array<{ timestamp: Date; block: number; balance: string; staked: string }>,
): Promise<number> {
  try {
    let totalRewards = new Big(0);
    const rates = getExchangeRates(historic);
    const sevenDaysAgoTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const user of users) {
      try {
        const { data: activity } = await runeProvider.runes.walletActivity({
          address: user.address,
          rune_id: publicConfig.sRune.id,
          count: 1000,
          newerThan: new Date(sevenDaysAgoTimestamp),
        });
        const earnings = calculateEarningsFromActivity(activity, sevenDaysAgoTimestamp, rates);
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

type HistoricBalances = Array<{ timestamp: Date; block: number; balance: string; staked: string }>;

async function getProtocolData(): Promise<
  [number, number, { yearly: number; monthly: number; daily: number }, HistoricBalances]
> {
  const settled = await Promise.allSettled([
    canister.getExchangeRateDecimal(),
    resolveRunePriceUsd({ runeName: publicConfig.rune.name }),
    getProtocolApy(),
    db.poolBalance.getHistoric(),
  ]);

  type SettledResult<T> = PromiseSettledResult<T>;
  const pick = <T>(i: number): T | undefined =>
    (settled[i] as SettledResult<T>).status === 'fulfilled'
      ? (settled[i] as PromiseFulfilledResult<T>).value
      : undefined;

  const defaultRateDecimal = 1;
  const defaultTokenPrice = 0;
  const defaultApy = { yearly: 0, monthly: 0, daily: 0 };
  const defaultHistoric: HistoricBalances = [];

  return [
    pick<number>(0) ?? defaultRateDecimal,
    pick<number>(1) ?? defaultTokenPrice,
    pick<{ yearly: number; monthly: number; daily: number }>(2) ?? defaultApy,
    pick<HistoricBalances>(3) ?? defaultHistoric,
  ];
}

async function processUserEmail(
  user: WeeklyEmailUser,
  tokenPrice: number,
  exchangeRate: number,
  apy: number,
  totalRewardsDistributed: number,
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

    const earnedLiq = await calculateUserEarnings(user.address);
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

  const [rateDecimal, tokenPrice, apy, historic] = await getProtocolData();

  const exchangeRate =
    rateDecimal && Number.isFinite(rateDecimal) && rateDecimal > 0 ? rateDecimal : 1;

  const totalRewardsDistributed = await calculateTotalRewardsDistributed(users, historic);
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
