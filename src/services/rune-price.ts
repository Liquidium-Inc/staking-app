import Big from 'big.js';

import { SATOSHIS_PER_BTC as SATS_PER_BTC } from '@/lib/bitcoin-units';
import { logger } from '@/lib/logger';
import { coingecko, convertUsdPriceToSats } from '@/providers/coingecko';
import { mempool } from '@/providers/mempool';
import { ordiscan } from '@/providers/ordiscan';

export interface ResolveRunePriceParams {
  runeName: string;
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
}: ResolveRunePriceParams): Promise<null | number> {
  if (!runeName.trim()) {
    throw new Error('runeName must be a non-empty string');
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

  return null;
}

/**
 * Resolves the LIQ price in sats and the BTC/USD price used to derive it.
 */
export async function resolveRunePriceSnapshot(
  params: ResolveRunePriceParams,
): Promise<RunePriceSnapshot> {
  const [btcPriceResult, coinGeckoPriceUsd] = await Promise.allSettled([
    mempool.getPrice(),
    coingecko.liquidium.getPriceUsd(),
  ]);

  const btcPriceUsd =
    btcPriceResult.status === 'fulfilled'
      ? btcPriceResult.value.USD
      : (() => {
          logger.warn(
            'BTC price fetch failed while resolving rune price snapshot:',
            btcPriceResult.reason,
          );
          return 0;
        })();

  const coinGeckoUsd = coinGeckoPriceUsd.status === 'fulfilled' ? coinGeckoPriceUsd.value : null;

  const runePriceSats =
    coinGeckoUsd && btcPriceUsd > 0
      ? convertUsdPriceToSats(coinGeckoUsd, btcPriceUsd)
      : await getFallbackRunePriceInSats(params);

  return {
    btcPriceUsd,
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
