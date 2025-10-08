import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Big from 'big.js';
import { useEffect } from 'react';

import type { GET } from '@/app/api/stake/pending/route';
import { config } from '@/config/public';
import { ApiOutput } from '@/utils/api-output';

import { useProtocol } from './useProtocol';

type PendingStakesResponse = ApiOutput<typeof GET>;

const expectedConfirmations = config.protocol.expectedConfirmations;

export const usePendingStakes = (address: string) => {
  const queryClient = useQueryClient();
  const { data: protocol } = useProtocol();

  function hasBlockHeight(x: unknown): x is { block_height: number } {
    return typeof x === 'object' && x !== null && 'block_height' in (x as Record<string, unknown>);
  }

  const value = useQuery({
    enabled: !!address,
    queryKey: ['pending-stakes', address],
    queryFn: async () => {
      const { data } = await axios.get<PendingStakesResponse>('/api/stake/pending', {
        params: { address },
      });
      return data.entries
        .map((x) => ({
          ...x,
          amount: new Big(String(x.amount)).div(new Big(10).pow(protocol.rune.decimals)).toNumber(),
          sAmount: new Big(String(x.sAmount))
            .div(new Big(10).pow(protocol.staked.decimals))
            .toNumber(),
          confirmations: hasBlockHeight(x.status) ? data.last_block - x.status.block_height + 1 : 0,
          expectedConfirmations,
        }))
        .filter((x) => x.confirmations < x.expectedConfirmations);
    },
    staleTime: 60 * 1000,
    refetchInterval(query) {
      if (query.state.data?.length) {
        return 60 * 1000;
      }
      return false;
    },
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['balance', address] });
  }, [value?.data?.length, address, queryClient]);

  return value;
};
