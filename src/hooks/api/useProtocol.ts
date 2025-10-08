import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import type { GET } from '@/app/api/protocol/route';
import { config } from '@/config/public';
import type { ApiOutput } from '@/utils/api-output';

type ProtocolResponse = ApiOutput<typeof GET>;

const initialData = {
  exchangeRate: Number.POSITIVE_INFINITY,
  btc: {
    price: config.sRune.debug.btcPrice,
  },
  canisterAddress: '',
  rune: {
    ...config.rune,
    priceSats: config.sRune.debug.price,
  },
  staked: config.sRune,
  historicRates: [],
  apy: {
    window: 0,
    monthly: 0,
    daily: 0,
    yearly: 0,
  },
} satisfies ProtocolResponse;

const overwrite = config.protocol.overwriteTokenConfig;

export const useProtocol = () => {
  const value = useQuery({
    queryKey: ['protocol'],
    queryFn: async () => {
      const { data } = await axios.get<ProtocolResponse>('/api/protocol');

      if (overwrite) {
        // Preserve live token names coming from the API (they include spaced rune names),
        // but allow local config values to override other fields useful for debugging.
        data.btc.price = initialData.btc.price || data.btc.price;

        data.staked = {
          ...data.staked,
          symbol: initialData.staked.symbol || data.staked.symbol,
          decimals: initialData.staked.decimals ?? data.staked.decimals,
        };

        data.rune = {
          ...data.rune,
          symbol: initialData.rune.symbol || data.rune.symbol,
          decimals: initialData.rune.decimals ?? data.rune.decimals,
          priceSats: initialData.rune.priceSats || data.rune.priceSats,
        };
      }
      return data;
    },
    initialData,
    initialDataUpdatedAt: 0,
    staleTime: 60 * 1000,
  });
  return value;
};
