import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Big from 'big.js';

import type { GET } from '@/app/api/account/balance/route';
import type { ApiOutput } from '@/utils/api-output';

type BalanceResponse = ApiOutput<typeof GET>;

/**
 * Loads a wallet token balance once the address and token are known.
 */
export const useBalance = (address: string, tokenId: string, decimals: number) => {
  const normalizedAddress = address.trim();
  const isEnabled = Boolean(normalizedAddress && tokenId);

  const value = useQuery({
    queryKey: ['balance', normalizedAddress, tokenId],
    queryFn: async () => {
      const { data } = await axios.get<BalanceResponse>('/api/account/balance', {
        params: { address: normalizedAddress, tokenId },
      });
      if (Array.isArray(data)) {
        throw new Error('Multiple tokens found');
      }
      return Big(data.total_balance).div(Big(10).pow(decimals)).toNumber();
    },
    enabled: isEnabled,
    staleTime: 60 * 1000,
  });
  return value;
};
