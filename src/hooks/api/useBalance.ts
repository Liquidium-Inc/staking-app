import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import type { GET } from '@/app/api/account/balance/route';
import type { ApiOutput } from '@/utils/api-output';

type BalanceResponse = ApiOutput<typeof GET>;

export const useBalance = (address: string, tokenId: string, decimals: number) => {
  const value = useQuery({
    queryKey: ['balance', address, tokenId],
    queryFn: async () => {
      if (!address || !tokenId) return 0;
      const { data } = await axios.get<BalanceResponse>('/api/account/balance', {
        params: { address, tokenId },
      });
      if (Array.isArray(data)) {
        throw new Error('Multiple tokens found');
      }
      return (+data.total_balance / 10 ** decimals) as number;
    },
    staleTime: 60 * 1000,
  });
  return value;
};
