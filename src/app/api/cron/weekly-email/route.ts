import Big from 'big.js';
import { NextRequest } from 'next/server';

import { config } from '@/config/config';
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

export const maxDuration = 300; // 5 minutes

// Helper function to mask email addresses in logs for privacy
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***@***';
  if (local.length <= 2) {
    return `${local[0] ?? '*'}***@${domain}`;
  }
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}

// Helper function to fetch rune price with Ordiscan primary, BIS fallback
async function getRunePriceInSats(runeName: string, runeId: string): Promise<number | null> {
  if (!runeName?.trim() || !runeId?.trim()) {
    throw new Error('runeName and runeId must be non-empty strings');
  }

  // Try Ordiscan first
  try {
    const { data: marketData } = await ordiscan.rune.market(runeName);
    if (marketData.price_in_sats > 0) {
      return marketData.price_in_sats;
    }
  } catch (error) {
    logger.warn(`Ordiscan price fetch failed for ${runeName}:`, error);
  }

  // Fallback to Best In Slot
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

// Helper function to get exchange rates from historic data
function getExchangeRates(
  historic: Array<{ timestamp: Date; block: number; balance: string; staked: string }>,
) {
  const supply = publicConfig.sRune.supply;

  return historic.reduce(
    (acc, balance: { timestamp: Date; block: number; balance: string; staked: string }) => {
      const diff = BigInt(supply) - BigInt(balance.staked);
      const rate = diff > 0 && +balance.balance > 0 ? +balance.balance / Number(diff) : 1;

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

// Helper function to calculate earnings from activity
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
  } satisfies Record<(typeof activity)[0]['event_type'], number>;

  const values = activity
    .filter((tx) => tx.block_height >= sevenDaysAgoBlock && tx.rune_id === publicConfig.sRune.id)
    .map((tx) => {
      const mult = multiplier[tx.event_type as keyof typeof multiplier] ?? 0;
      return {
        value: mult * Number(tx.amount) * 10 ** -tx.decimals,
        block: tx.block_height,
      };
    })
    .reverse();

  const rateValues = [
    { value: 1, block: 0 },
    ...rates.map(({ rate, block }: { rate: number; block: number }) => ({ value: rate, block })),
    { value: rates[rates.length - 1]?.rate ?? 1, block: Number.POSITIVE_INFINITY },
  ];

  return computeEarnings(values, rateValues);
}

// Calculate user's earnings in the last 7 days
async function calculateUserEarnings(address: string): Promise<number> {
  try {
    const [{ data: activity }, historic] = await Promise.all([
      runeProvider.runes.walletActivity({
        address,
        rune_id: publicConfig.sRune.id,
        count: 1000,
      }),
      db.poolBalance.getHistoric(),
    ]);

    const rates = getExchangeRates(historic);

    // Bitcoin averages ~144 blocks/day (10 min target), so 7 days ≈ 1008 blocks
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

// Get protocol APY from the same logic as the portfolio page
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
      24 * 60 * 60 * 1000, // 1 day
      Math.min(30 * 24 * 60 * 60 * 1000, totalTimeSpan), // 30 days max
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

// Calculate total rewards distributed to all users in the last 7 days
async function calculateTotalRewardsDistributed(
  users: Array<{ address: string; email: string }>,
  historic: Array<{ timestamp: Date; block: number; balance: string; staked: string }>,
): Promise<number> {
  try {
    let totalRewards = new Big(0);
    const rates = getExchangeRates(historic);

    // Calculate earnings for each user
    for (const user of users) {
      try {
        const { data: activity } = await runeProvider.runes.walletActivity({
          address: user.address,
          rune_id: publicConfig.sRune.id,
          count: 1000,
        });

        // Bitcoin averages ~144 blocks/day (10 min target), so 7 days ≈ 1008 blocks
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

// Helper function to get protocol data
async function getProtocolData() {
  return await Promise.all([
    BIS.runes.ticker({ rune_id: publicConfig.rune.id }),
    BIS.runes.ticker({ rune_id: publicConfig.sRune.id }),
    canister.getExchangeRate(),
    getRunePriceInSats(publicConfig.rune.name, publicConfig.rune.id),
    mempool.getPrice(),
    getProtocolApy(),
    db.poolBalance.getHistoric(),
  ]);
}

// Helper function to process individual user email
async function processUserEmail(
  user: { address: string; email: string },
  tokenPrice: number,
  exchangeRate: number,
  apy: number,
  totalRewardsDistributed: number,
): Promise<{ success: boolean; skipped: boolean }> {
  try {
    // Get user's sLIQ balance
    const { data: balance } = await runeProvider.runes.walletBalances({
      address: user.address,
    });

    const sLiqBalance = balance.find((b) => b.rune_id === publicConfig.sRune.id);
    const sLiqAmount = sLiqBalance
      ? Number(sLiqBalance.total_balance) / 10 ** publicConfig.sRune.decimals
      : 0;

    if (sLiqAmount <= 0) {
      return { success: false, skipped: true };
    }

    // Calculate user's earnings and staked value
    const earnedLiq = await calculateUserEarnings(user.address);
    const stakedValue = sLiqAmount * exchangeRate * tokenPrice;

    // Generate and send email
    const emailTemplate = await emailService.generateWeeklyReportEmail({
      address: user.address,
      email: user.email,
      sLiqBalance: sLiqAmount,
      earnedLiq,
      apy,
      totalRewardsDistributed,
      tokenPrice,
      stakedValue,
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

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${config.secrets.cron}`)
    return new Response('Unauthorized', { status: 401 });

  try {
    logger.info('Starting weekly email cron job');

    // Clean up expired tokens and get users
    await db.emailSubscription.deleteExpiredTokens();
    const users = await db.emailSubscription.getActiveVerifiedUsers();

    logger.info(`Found ${users.length} verified users`);

    if (users.length === 0) {
      return Response.json({ success: true, message: 'No users to send emails to' });
    }
    // Get protocol data
    const [, , rate, runePriceSats, btcPrice, apy, historic] = await getProtocolData();

    const tokenPrice = Big(runePriceSats ?? 0)
      .times(btcPrice.USD || 0)
      .div(100_000_000)
      .toNumber();

    const exchangeRate =
      Number(rate.circulating) !== 0 ? Number(rate.balance) / Number(rate.circulating) : 1;

    // Calculate total rewards
    const totalRewardsDistributed = await calculateTotalRewardsDistributed(users, historic);
    logger.info(`Total rewards distributed in last 7 days: ${totalRewardsDistributed} LIQ`);

    // Process emails for each user
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

      if (result.success) {
        emailsSent++;
      } else {
        emailsSkipped++;
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info(`Weekly email cron job completed. Sent: ${emailsSent}, Skipped: ${emailsSkipped}`);

    return Response.json({
      success: true,
      message: `Weekly emails sent successfully`,
      stats: {
        totalUsers: users.length,
        emailsSent,
        emailsSkipped,
      },
    });
  } catch (error) {
    logger.error('Weekly email cron job failed:', error);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
