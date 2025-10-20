import Big from 'big.js';

import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { computeEarnings } from '@/lib/earnings';
import { logger } from '@/lib/logger';
import { BIS } from '@/providers/bestinslot';
import { canister } from '@/providers/canister';
import { emailService } from '@/providers/email';
import { mempool } from '@/providers/mempool';
import { ordiscan } from '@/providers/ordiscan';
import { runeProvider } from '@/providers/rune-provider';

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

async function getRunePriceInSats(runeName: string, runeId: string): Promise<number | null> {
  if (!runeName?.trim() || !runeId?.trim()) {
    throw new Error('runeName and runeId must be non-empty strings');
  }

  try {
    const { data: marketData } = await ordiscan.rune.market(runeName);
    if (marketData.price_in_sats > 0) {
      return marketData.price_in_sats;
    }
  } catch (error) {
    logger.warn(`Ordiscan price fetch failed for ${runeName}:`, error);
  }

  try {
    const { data: rune } = await BIS.runes.ticker({ rune_id: runeId });
    return rune.avg_unit_price_in_sats && rune.avg_unit_price_in_sats > 0
      ? rune.avg_unit_price_in_sats
      : null;
  } catch (error) {
    logger.error(`BIS price fetch also failed for ${runeId}:`, error);
    return null;
  }
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
    block_height: number;
    rune_id: string;
    amount: string;
    decimals: number;
    event_type: string;
  }>,
  sevenDaysAgoBlock: number,
  rates: Array<{ timestamp: Date; block: number; rate: number }>,
) {
  const multiplier = {
    input: -1,
    output: 1,
    'new-allocation': 0,
    mint: 0,
    burn: 0,
  } as const;

  const values = activity
    .filter((tx) => tx.block_height >= sevenDaysAgoBlock && tx.rune_id === publicConfig.sRune.id)
    .map((tx) => {
      const mult = multiplier[tx.event_type as keyof typeof multiplier] ?? 0;
      const value = Big(tx.amount).div(Big(10).pow(tx.decimals)).times(mult).toNumber();
      return { value, block: tx.block_height };
    })
    .reverse();

  const rateValues = [
    { value: 1, block: 0 },
    ...rates.map(({ rate, block }: { rate: number; block: number }) => ({ value: rate, block })),
    { value: rates[rates.length - 1]?.rate ?? 1, block: Number.POSITIVE_INFINITY },
  ];

  return computeEarnings(values, rateValues);
}

async function calculateUserEarnings(address: string): Promise<number> {
  try {
    const [{ data: activity }, historic] = await Promise.all([
      runeProvider.runes.walletActivity({ address, rune_id: publicConfig.sRune.id, count: 1000 }),
      db.poolBalance.getHistoric(),
    ]);

    const rates = getExchangeRates(historic);

    const sevenDaysBlocks = 7 * 144;
    const maxHeight = activity.reduce((max, tx) => Math.max(max, tx.block_height), 0);
    const sevenDaysAgoBlock = Math.max(0, maxHeight - sevenDaysBlocks);

    const earnings = calculateEarningsFromActivity(activity, sevenDaysAgoBlock, rates);

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

    if (historicRates.length < 2) {
      return { yearly: 0, monthly: 0, daily: 0 };
    }

    const lastRate = historicRates[historicRates.length - 1];
    const totalTimeSpan = lastRate.timestamp.getTime() - historicRates[0].timestamp.getTime();
    const targetTimeSpan = Math.max(
      24 * 60 * 60 * 1000,
      Math.min(30 * 24 * 60 * 60 * 1000, totalTimeSpan),
    );

    const referenceRate =
      historicRates.findLast(({ timestamp }) => {
        const diff = lastRate.timestamp.getTime() - timestamp.getTime();
        return diff >= targetTimeSpan;
      }) ?? historicRates[0];

    const diffDays = Math.round(
      (lastRate.timestamp.getTime() - referenceRate.timestamp.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (referenceRate.rate === 0 || diffDays <= 0) {
      return { yearly: 0, monthly: 0, daily: 0 };
    }

    const yearlyRate = (lastRate.rate / referenceRate.rate) ** (365 / diffDays) - 1;

    if (!Number.isFinite(yearlyRate)) {
      return { yearly: 0, monthly: 0, daily: 0 };
    }

    return {
      yearly: yearlyRate,
      monthly: (1 + yearlyRate) ** (1 / 12) - 1,
      daily: (1 + yearlyRate) ** (1 / 365) - 1,
    };
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

    for (const user of users) {
      try {
        const { data: activity } = await runeProvider.runes.walletActivity({
          address: user.address,
          rune_id: publicConfig.sRune.id,
          count: 1000,
        });

        const sevenDaysBlocks = 7 * 144;
        const maxHeight = activity.reduce((max, tx) => Math.max(max, tx.block_height), 0);
        const sevenDaysAgoBlock = Math.max(0, maxHeight - sevenDaysBlocks);

        const earnings = calculateEarningsFromActivity(activity, sevenDaysAgoBlock, rates);
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

async function getProtocolData() {
  return await Promise.all([
    BIS.runes.ticker({ rune_id: publicConfig.rune.id }),
    BIS.runes.ticker({ rune_id: publicConfig.sRune.id }),
    canister.getExchangeRateDecimal(),
    getRunePriceInSats(publicConfig.rune.name, publicConfig.rune.id),
    mempool.getPrice(),
    getProtocolApy(),
    db.poolBalance.getHistoric(),
  ]);
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

    if (sLiqAmountBig.lte(0)) {
      return { success: false, skipped: true };
    }

    const earnedLiq = await calculateUserEarnings(user.address);
    const stakedValueBig = sLiqAmountBig.times(exchangeRate).times(tokenPrice);

    const emailTemplate = await emailService.generateWeeklyReportEmail({
      address: user.address,
      email: user.email,
      sLiqBalance: sLiqAmountBig.toNumber(),
      earnedLiq,
      apy,
      totalRewardsDistributed,
      tokenPrice,
      stakedValue: stakedValueBig.toNumber(),
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

  const [, , rateDecimal, runePriceSats, btcPrice, apy, historic] = await getProtocolData();

  const tokenPrice = Big(runePriceSats ?? 0)
    .times(btcPrice.USD || 0)
    .div(100_000_000)
    .toNumber();

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
