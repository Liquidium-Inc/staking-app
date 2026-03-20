import { NextResponse } from 'next/server';

import { config } from '@/config/public';
import { db } from '@/db';
import { computeApyFromHistoric } from '@/lib/apy';
import { logger } from '@/lib/logger';
import { pick } from '@/lib/pick';
import { BIS } from '@/providers/bestinslot';
import { canister } from '@/providers/canister';
import { redis } from '@/providers/redis';
import { resolveRunePriceSnapshot } from '@/services/rune-price';

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

export async function GET() {
  const historicPromise: Promise<Awaited<ReturnType<typeof db.poolBalance.getHistoric>>> =
    db.poolBalance.getHistoric().catch((error: unknown) => {
      logger.error('Historic pool balance fetch failed, falling back to empty history:', error);
      return [];
    });

  const [{ data: rune }, { data: staked }, rate, historic, priceSnapshot] = await Promise.all([
    getCachedRuneTicker(runeId),
    getCachedRuneTicker(stakedId),
    canister.getExchangeRate(),
    historicPromise,
    resolveRunePriceSnapshot({
      runeName: config.rune.name,
      runeId,
      getTicker: getCachedRuneTicker,
    }),
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

  const apy = computeApyFromHistoric(historicRates);

  return NextResponse.json({
    exchangeRate:
      Number(rate.circulating) !== 0 ? Number(rate.balance) / Number(rate.circulating) : 1,
    btc: {
      price: priceSnapshot.btcPriceUsd,
    },
    rune: {
      id: runeId,
      symbol: rune.symbol,
      name: rune.spaced_rune_name,
      decimals: rune.decimals,
      priceSats:
        priceSnapshot.runePriceSats ??
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
