import axios from 'axios';

import { config } from '@/config/config';
import { spanWrap } from '@/lib/tracing';

const { token, url: baseUrl } = config.ordiscan;

const api = axios.create({
  baseURL: baseUrl,
  headers: { Authorization: `Bearer ${token}` },
});

async function getRuneMarketData(runeName: string) {
  return await spanWrap('providers-ordiscan', 'getRuneMarketData', async () => {
    // Basic input validation to avoid malformed requests
    if (typeof runeName !== 'string' || runeName.trim().length === 0) {
      throw new Error('Invalid rune name: must be a non-empty string');
    }

    try {
      const { data } = await api.get<{
        data: {
          price_in_sats: number;
          price_in_usd: number;
          market_cap_in_btc: number;
          market_cap_in_usd: number;
        };
      }>(`/rune/${encodeURIComponent(runeName)}/market`);
      return data;
    } catch (error) {
      // Log and return a graceful fallback instead of propagating raw error
      console.error(`Failed to fetch market data for rune "${runeName}":`, error);
      return {
        data: {
          price_in_sats: 0,
          price_in_usd: 0,
          market_cap_in_btc: 0,
          market_cap_in_usd: 0,
        },
      };
    }
  });
}

export const ordiscan = {
  rune: {
    market: getRuneMarketData,
  },
};
