import { NextResponse } from 'next/server';

import { config } from '@/config/public';
import { db } from '@/db';
import { computeApyFromHistoric } from '@/lib/apy';
import { logger } from '@/lib/logger';
import { pick } from '@/lib/pick';
import { BIS } from '@/providers/bestinslot';
import { canister } from '@/providers/canister';
import { coingecko, convertUsdPriceToSats } from '@/providers/coingecko';
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

/**
 * Fetches the legacy LIQ price in sats from rune market data providers.
 */
async function getFallbackRunePriceInSats(
  runeName: string,
  runeId: string,
): Promise<number | null> {
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
  let historic: Awaited<ReturnType<typeof db.poolBalance.getHistoric>> = [];
  try {
    historic = await db.poolBalance.getHistoric();
  } catch (error) {
    logger.error('Historic pool balance fetch failed, falling back to empty history:', error);
  }

  const [{ data: rune }, { data: staked }, price, rate, runePriceUsd] = await Promise.all([
    getCachedRuneTicker(runeId),
    getCachedRuneTicker(stakedId),
    mempool.getPrice(),
    canister.getExchangeRate(),
    coingecko.liquidium.getPriceUsd(),
  ]);

  const runePriceSats =
    runePriceUsd && price.USD > 0
      ? convertUsdPriceToSats(runePriceUsd, price.USD)
      : await getFallbackRunePriceInSats(config.rune.name, runeId);

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

  const apy = computeApyFromHistoric(historicRates);

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
          logger.debug(
            'Price fetch failed for CoinGecko and legacy rune sources, using fallback price of 0',
          );
          return 0;
        })(),
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
    apy,
  });
}

// computeApyFromHistoric centralizes APY logic (see '@/lib/apy').
