import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import type { GET } from '@/app/api/account/txs/route';
import type { ApiOutput } from '@/utils/api-output';

type ActivityResponse = ApiOutput<typeof GET>;
const EMPTY_ACTIVITY_RESPONSE: ActivityResponse = {
  activity: [],
  truncated: false,
  originalFetchCount: 0,
  deduplicatedCount: 0,
};

export const useWalletActivity = (address: string) => {
  const value = useQuery({
    queryKey: ['activity', address],
    queryFn: async (): Promise<ActivityResponse> => {
      if (!address) return EMPTY_ACTIVITY_RESPONSE;
      const { data } = await axios.get<ActivityResponse>('/api/account/txs', {
        params: { address },
      });
      return data;
    },
    select: (data) => data.activity,
  });
  return value;
};
