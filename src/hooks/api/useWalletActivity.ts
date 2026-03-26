import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import type { GET } from '@/app/api/account/txs/route';
import type { ApiOutput } from '@/utils/api-output';

type ActivityResponse = ApiOutput<typeof GET>;

/**
 * Loads wallet activity once the wallet address is available.
 */
export const useWalletActivity = (address: string) => {
  const normalizedAddress = address.trim();
  const isEnabled = Boolean(normalizedAddress);

  const value = useQuery({
    queryKey: ['activity', normalizedAddress],
    queryFn: async (): Promise<ActivityResponse> => {
      const { data } = await axios.get<ActivityResponse>('/api/account/txs', {
        params: { address: normalizedAddress },
      });
      return data;
    },
    enabled: isEnabled,
    select: (data) => data.activity,
  });
  return value;
};
