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

async function getRuneInfo(runeName: string) {
  return await spanWrap('providers-ordiscan', 'getRuneInfo', async () => {
    if (typeof runeName !== 'string' || runeName.trim().length === 0) {
      throw new Error('Invalid rune name: must be a non-empty string');
    }

    const { data } = await api.get<{
      data: {
        id: string;
        name: string;
        formatted_name: string;
        symbol: string;
        decimals: number;
        current_supply: string;
        premined_supply: string;
      };
    }>(`/rune/${encodeURIComponent(runeName)}`);

    return data;
  });
}

type AddressRuneActivityParams = {
  page?: number;
  sort?: 'newest' | 'oldest';
};

async function getAddressRuneActivity(address: string, params: AddressRuneActivityParams = {}) {
  return await spanWrap('providers-ordiscan', 'getAddressRuneActivity', async () => {
    if (typeof address !== 'string' || address.trim().length === 0) {
      throw new Error('Invalid address: must be a non-empty string');
    }

    const { data } = await api.get<{
      data: Array<{
        txid: string;
        timestamp: string;
        runestone_messages: Array<{ rune: string; type: string }>;
        inputs: Array<{
          address: string;
          output: string;
          rune: string;
          rune_amount: string;
        }>;
        outputs: Array<{
          address: string;
          vout: number;
          rune: string;
          rune_amount: string;
        }>;
      }>;
    }>(`/address/${encodeURIComponent(address)}/activity/runes`, {
      params,
    });

    return data;
  });
}

export const ordiscan = {
  rune: {
    info: getRuneInfo,
    market: getRuneMarketData,
    walletActivity: getAddressRuneActivity,
  },
};
