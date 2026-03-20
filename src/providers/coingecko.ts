import Big from 'big.js';

import { logger } from '@/lib/logger';

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
const COINGECKO_LIQUIDIUM_COIN_ID = 'liquidium-token';
const SATS_PER_BTC = 100_000_000;

type CoinGeckoSimplePriceResponse = {
  'liquidium-token'?: {
    usd?: number;
  };
};

/**
 * Fetches the Liquidium token USD spot price from CoinGecko.
 */
async function getLiquidiumPriceUsd(): Promise<number | null> {
  try {
    const response = await fetch(
      `${COINGECKO_API_URL}/simple/price?ids=${COINGECKO_LIQUIDIUM_COIN_ID}&vs_currencies=usd`,
      { next: { revalidate: 60 } },
    );

    if (!response.ok) {
      logger.warn(`CoinGecko price fetch failed with status ${response.status}`);
      return null;
    }

    const data = (await response.json()) as CoinGeckoSimplePriceResponse;
    const priceUsd = data[COINGECKO_LIQUIDIUM_COIN_ID]?.usd;

    return typeof priceUsd === 'number' && priceUsd > 0 ? priceUsd : null;
  } catch (error) {
    logger.warn('CoinGecko price fetch failed:', error);
    return null;
  }
}

/**
 * Converts a USD-denominated token price into sats using the current BTC/USD rate.
 */
export function convertUsdPriceToSats(priceUsd: number, btcPriceUsd: number): number {
  if (priceUsd <= 0 || btcPriceUsd <= 0) {
    throw new Error('priceUsd and btcPriceUsd must be greater than 0');
  }

  return Big(priceUsd).times(SATS_PER_BTC).div(btcPriceUsd).toNumber();
}

export const coingecko = {
  liquidium: {
    getPriceUsd: getLiquidiumPriceUsd,
  },
};
