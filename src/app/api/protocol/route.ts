import { NextResponse } from 'next/server';
import { z } from 'zod';

import { config } from '@/config/public';
import { db } from '@/db';
import { computeApyFromHistoric } from '@/lib/apy';
import { logger } from '@/lib/logger';
import { pick } from '@/lib/pick';
import { canister } from '@/providers/canister';
import { ordiscan } from '@/providers/ordiscan';
import { redis } from '@/providers/redis';
import { resolveRunePriceSnapshot } from '@/services/rune-price';

const totalSupply = config.sRune.supply;

type ProtocolRuneInfo = {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  supply: string;
};

const ProtocolRuneInfoSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int().nonnegative(),
  supply: z.string().min(1),
});

/**
 * Fetches cached rune metadata from Ordiscan and falls back to static config when unavailable.
 */
async function getCachedRuneInfo(
  runeName: string,
  fallback: Omit<ProtocolRuneInfo, 'name' | 'supply'> & { name: string; supply?: string },
): Promise<ProtocolRuneInfo> {
  const cacheKey = `ordiscan:rune:info:${runeName}`;

  if (redis.client) {
    try {
      const cached = await redis.client.get(cacheKey);
      if (cached) {
        const parsedCached = ProtocolRuneInfoSchema.safeParse(JSON.parse(cached));
        if (parsedCached.success) {
          logger.debug(`Cache hit for rune info ${runeName}`);
          return parsedCached.data;
        }

        logger.warn(`Cached rune info for ${runeName} failed validation:`, parsedCached.error);
      }
    } catch (error) {
      logger.warn(`Cache read failed for rune info ${runeName}:`, error);
    }
  }

  try {
    logger.debug(`Cache miss for rune info ${runeName}, fetching from Ordiscan`);
    const { data } = await ordiscan.rune.info(runeName);
    const parsedResult = ProtocolRuneInfoSchema.safeParse({
      id: data.id ? String(data.id) : fallback.id,
      symbol: data.symbol || fallback.symbol,
      name: data.formatted_name || fallback.name,
      decimals: data.decimals ?? fallback.decimals,
      supply: String(data.current_supply || data.premined_supply || fallback.supply || '0'),
    });

    if (!parsedResult.success) {
      logger.warn(`Ordiscan rune info for ${runeName} failed validation:`, parsedResult.error);
      throw new Error(`Invalid Ordiscan rune info for ${runeName}`);
    }

    const result = parsedResult.data;

    if (redis.client) {
      try {
        await redis.client.set(cacheKey, JSON.stringify(result), 'EX', 3600);
        logger.debug(`Cached rune info for ${runeName}`);
      } catch (error) {
        logger.warn(`Cache write failed for rune info ${runeName}:`, error);
      }
    }

    return result;
  } catch (error) {
    logger.warn(`Ordiscan rune info fetch failed for ${runeName}, using static fallback:`, error);
    return ProtocolRuneInfoSchema.parse({
      id: fallback.id,
      symbol: fallback.symbol,
      name: fallback.name,
      decimals: fallback.decimals,
      supply: String(fallback.supply || '0'),
    });
  }
}

export async function GET() {
  const historicPromise: Promise<Awaited<ReturnType<typeof db.poolBalance.getHistoric>>> =
    db.poolBalance.getHistoric().catch((error: unknown) => {
      logger.error('Historic pool balance fetch failed, falling back to empty history:', error);
      return [];
    });

  const [rune, staked, rate, historic, priceSnapshot] = await Promise.all([
    getCachedRuneInfo(config.rune.name, {
      id: config.rune.id,
      symbol: config.rune.symbol,
      name: config.rune.name,
      decimals: config.rune.decimals,
    }),
    getCachedRuneInfo(config.sRune.name, {
      id: config.sRune.id,
      symbol: config.sRune.symbol,
      name: config.sRune.name,
      decimals: config.sRune.decimals,
      supply: String(config.sRune.supply),
    }),
    canister.getExchangeRate(),
    historicPromise,
    resolveRunePriceSnapshot({
      runeName: config.rune.name,
    }),
  ]);

  const supply = totalSupply != null ? BigInt(totalSupply) : BigInt(staked.supply);
  const runePriceSats = priceSnapshot.runePriceSats ?? 0;
  if (priceSnapshot.runePriceSats == null) {
    logger.debug('Price fetch failed for CoinGecko and Ordiscan, using fallback price of 0');
  }

  const historicRates = historic.reduce(
    (acc, balance) => {
      const diff = supply - BigInt(balance.staked);
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
      price: priceSnapshot.btcPriceUsd,
    },
    rune: {
      id: rune.id,
      symbol: rune.symbol,
      name: rune.name,
      decimals: rune.decimals,
      priceSats: runePriceSats,
    },
    staked: {
      id: staked.id,
      symbol: staked.symbol,
      name: staked.name,
      decimals: staked.decimals ?? 0,
    },
    // TODO: Only pick one value per day
    historicRates: historicRates.map((e) => pick(e, 'timestamp', 'block', 'rate')),
    canisterAddress: canister.address,
    apy,
  });
}

// computeApyFromHistoric centralizes APY logic (see '@/lib/apy').
