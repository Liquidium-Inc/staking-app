import Big from 'big.js';

import { logger } from '@/lib/logger';
import { BIS } from '@/providers/bestinslot';
import { coingecko, convertUsdPriceToSats } from '@/providers/coingecko';
import { mempool } from '@/providers/mempool';
import { ordiscan } from '@/providers/ordiscan';

const SATS_PER_BTC = 100_000_000;

type RuneTickerResult = Awaited<ReturnType<typeof BIS.runes.ticker>>;
type RuneTickerLoader = (runeId: string) => Promise<RuneTickerResult>;

export interface ResolveRunePriceParams {
  runeName: string;
  runeId: string;
  getTicker?: RuneTickerLoader;
}

export interface RunePriceSnapshot {
  btcPriceUsd: number;
  runePriceSats: null | number;
}

/**
 * Fetches the legacy LIQ price in sats from rune market data providers.
 */
async function getFallbackRunePriceInSats({
  runeName,
  runeId,
  getTicker = (fallbackRuneId) => BIS.runes.ticker({ rune_id: fallbackRuneId }),
}: ResolveRunePriceParams): Promise<null | number> {
  if (!runeName.trim() || !runeId.trim()) {
    throw new Error('runeName and runeId must be non-empty strings');
  }

  try {
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
    logger.debug(`Falling back to Best In Slot for rune ID ${runeId}`);
    const { data: rune } = await getTicker(runeId);
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

/**
 * Resolves the LIQ price in sats and the BTC/USD price used to derive it.
 */
export async function resolveRunePriceSnapshot(
  params: ResolveRunePriceParams,
): Promise<RunePriceSnapshot> {
  const [btcPrice, coinGeckoPriceUsd] = await Promise.all([
    mempool.getPrice(),
    coingecko.liquidium.getPriceUsd(),
  ]);

  const runePriceSats =
    coinGeckoPriceUsd && btcPrice.USD > 0
      ? convertUsdPriceToSats(coinGeckoPriceUsd, btcPrice.USD)
      : await getFallbackRunePriceInSats(params);

  return {
    btcPriceUsd: btcPrice.USD,
    runePriceSats,
  };
}

/**
 * Resolves the LIQ price in USD, preferring CoinGecko and falling back to rune market data.
 */
export async function resolveRunePriceUsd(params: ResolveRunePriceParams): Promise<number> {
  try {
    const coinGeckoPriceUsd = await coingecko.liquidium.getPriceUsd();
    if (coinGeckoPriceUsd) {
      return coinGeckoPriceUsd;
    }

    const [priceSats, btcPrice] = await Promise.all([
      getFallbackRunePriceInSats(params),
      mempool.getPrice(),
    ]);

    if (!priceSats || btcPrice.USD <= 0) {
      return 0;
    }

    return Big(priceSats).times(btcPrice.USD).div(SATS_PER_BTC).toNumber();
  } catch (error) {
    logger.error('Failed to resolve rune price in USD:', error);
    return 0;
  }
}
