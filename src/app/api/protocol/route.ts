import { NextResponse } from 'next/server';

import { config } from '@/config/public';
import { db } from '@/db';
import { logger } from '@/lib/logger';
import { pick } from '@/lib/pick';
import { BIS } from '@/providers/bestinslot';
import { canister } from '@/providers/canister';
import { mempool } from '@/providers/mempool';
import { ordiscan } from '@/providers/ordiscan';
import { redis } from '@/providers/redis';

const runeId = config.rune.id;
const stakedId = config.sRune.id;
const totalSupply = config.sRune.supply;

// Cached proxy for BIS.runes.ticker with 1-hour Redis cache
async function getCachedRuneTicker(runeId: string) {
  const cacheKey = `bis:rune:ticker:${runeId}`;

  if (redis.client) {
    try {
      const cached = await redis.client.get(cacheKey);
      if (cached) {
        logger.debug(`Cache hit for rune ticker ${runeId}`);
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn(`Cache read failed for rune ticker ${runeId}:`, error);
    }
  }

  logger.debug(`Cache miss for rune ticker ${runeId}, fetching from BIS`);
  const result = await BIS.runes.ticker({ rune_id: runeId });

  if (redis.client && result.data) {
    try {
      await redis.client.set(cacheKey, JSON.stringify(result), 'EX', 3600); // 1 hour
      logger.debug(`Cached rune ticker for ${runeId}`);
    } catch (error) {
      logger.warn(`Cache write failed for rune ticker ${runeId}:`, error);
    }
  }

  return result;
}

// Helper function to fetch rune price with Ordiscan primary, BIS fallback
async function getRunePriceInSats(runeName: string, runeId: string): Promise<number | null> {
  // Validate inputs — should never be empty due to build-time checks, but guard against future regressions.
  if (!runeName || !runeName.trim() || !runeId || !runeId.trim()) {
    throw new Error('runeName and runeId must be non-empty strings');
  }

  try {
    // Try Ordiscan first
    logger.debug(`Fetching price from Ordiscan for ${runeName}`);
    const { data: marketData } = await ordiscan.rune.market(runeName);
    if (marketData.price_in_sats && marketData.price_in_sats > 0) {
      logger.info(`Ordiscan price for ${runeName}: ${marketData.price_in_sats} sats`);
      return marketData.price_in_sats;
    }
  } catch (error) {
    logger.warn(`Ordiscan price fetch failed for ${runeName}:`, error);
  }

  try {
    // Fallback to Best In Slot
    logger.debug(`Falling back to Best In Slot for rune ID ${runeId}`);
    const { data: rune } = await getCachedRuneTicker(runeId);
    const bisPrice =
      rune.avg_unit_price_in_sats && rune.avg_unit_price_in_sats > 0
        ? rune.avg_unit_price_in_sats
        : null;
    if (bisPrice !== null) {
      logger.info(`BIS fallback price for ${runeName}: ${bisPrice} sats`);
    }
    return bisPrice;
  } catch (error) {
    logger.error(`BIS price fetch also failed for ${runeId}:`, error);
    return null;
  }
}

export async function GET() {
  const [{ data: rune }, { data: staked }, historic, price, rate, runePriceSats] =
    await Promise.all([
      getCachedRuneTicker(runeId),
      getCachedRuneTicker(stakedId),
      db.poolBalance.getHistoric(),
      mempool.getPrice(),
      canister.getExchangeRate(),
      getRunePriceInSats(config.rune.name, runeId),
    ]);

  const supply = totalSupply || staked.total_minted_supply;

  const historicRates = historic.reduce(
    (acc, balance) => {
      const diff = BigInt(supply) - BigInt(balance.staked);
      const rate = diff > 0 && +balance.balance > 0 ? +balance.balance / Number(diff) : 1;
      if (acc[acc.length - 1]?.rate !== rate)
        acc.push({
          timestamp: balance.timestamp,
          block: balance.block,
          rate,
        });
      return acc;
    },
    [] as { timestamp: Date; block: number; rate: number }[],
  );

  const apy =
    historicRates.length >= 2
      ? (() => {
          const lastRate = historicRates[historicRates.length - 1];
          const totalTimeSpan = lastRate.timestamp.getTime() - historicRates[0].timestamp.getTime();
          const minTimeSpan = 24 * 60 * 60 * 1000; // 1 day
          const maxTimeSpan = 30 * 24 * 60 * 60 * 1000; // 30 days
          const targetTimeSpan = Math.max(minTimeSpan, Math.min(maxTimeSpan, totalTimeSpan));

          const referenceRate =
            historicRates.findLast(({ timestamp }) => {
              const diff = lastRate.timestamp.getTime() - timestamp.getTime();
              return diff >= targetTimeSpan;
            }) ?? historicRates[0];

          return computeApy(lastRate, referenceRate);
        })()
      : (() => {
          logger.debug('Insufficient historic data for APY calculation', {
            historicRatesCount: historicRates.length,
          });
          return { yearly: 0, interval: 0 };
        })();

  return NextResponse.json({
    exchangeRate:
      Number(rate.circulating) !== 0 ? Number(rate.balance) / Number(rate.circulating) : 1,
    btc: {
      price: price.USD,
    },
    rune: {
      id: runeId,
      symbol: rune.symbol,
      name: rune.spaced_rune_name,
      decimals: rune.decimals,
      priceSats:
        runePriceSats ??
        (() => {
          logger.debug('Price fetch failed for both APIs, using fallback price of 0');
          return 0;
        })(), // Using Ordiscan primary, BIS fallback
      // priceSats: rune.avg_unit_price_in_sats ?? 0, // Old BIS-only price (kept as reference)
    },
    staked: {
      id: stakedId,
      symbol: staked.symbol,
      name: staked.spaced_rune_name,
      decimals: staked.decimals ?? 0,
    },
    // TODO: Only pick one value per day
    historicRates: historicRates.map((e) => pick(e, 'timestamp', 'block', 'rate')),
    canisterAddress: canister.address,
    apy: {
      window: apy.interval,
      yearly: apy.yearly,
      monthly: (1 + apy.yearly) ** (1 / 12) - 1,
      daily: (1 + apy.yearly) ** (1 / 365) - 1,
    },
  });
}

const computeApy = (
  currentRate: { timestamp: Date; rate: number },
  referenceRate: { timestamp: Date; rate: number },
) => {
  const diff = currentRate.timestamp.getTime() - referenceRate.timestamp.getTime();
  const diffDays = Math.round(diff / (1000 * 60 * 60 * 24));

  // Handle edge cases
  if (referenceRate.rate === 0 || diffDays <= 0) {
    logger.debug('APY calculation edge case detected', {
      referenceRateIsZero: referenceRate.rate === 0,
      diffDays,
    });
    return { yearly: 0, interval: diffDays };
  }

  const yearlyRate = (currentRate.rate / referenceRate.rate) ** (365 / diffDays) - 1;

  // Handle numerical edge cases
  if (!Number.isFinite(yearlyRate)) {
    return { yearly: 0, interval: diffDays };
  }

  return {
    yearly: yearlyRate,
    interval: diffDays,
  };
};
