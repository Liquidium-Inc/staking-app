import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import type { GET } from '@/app/api/account/txs/route';
import type { ApiOutput } from '@/utils/api-output';

type ActivityResponse = ApiOutput<typeof GET>;

export const useWalletActivity = (address: string) => {
  const value = useQuery({
    queryKey: ['activity', address],
    queryFn: async () => {
      if (!address) return [];
      const { data } = await axios.get<ActivityResponse>('/api/account/txs', {
        params: { address },
      });
      return data;
    },
  });
  return value;
};
