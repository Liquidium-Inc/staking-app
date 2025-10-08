import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Big from 'big.js';
import { useEffect } from 'react';

import type { GET } from '@/app/api/unstake/pending/route';
import { config } from '@/config/public';
import { ApiOutput } from '@/utils/api-output';

import { useProtocol } from './useProtocol';

// Narrow entries that include numeric/string amounts
function hasAmounts(x: unknown): x is { amount: string | number; sAmount: string | number } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'amount' in (x as Record<string, unknown>) &&
    'sAmount' in (x as Record<string, unknown>)
  );
}

function hasBlockHeight(x: unknown): x is { block_height: number } {
  return typeof x === 'object' && x !== null && 'block_height' in (x as Record<string, unknown>);
}

type PendingStakesResponse = ApiOutput<typeof GET>;

const expectedConfirmations = config.protocol.expectedConfirmations;

export const usePendingUnstakes = (address: string) => {
  const queryClient = useQueryClient();
  const { data: protocol } = useProtocol();

  const value = useQuery({
    enabled: !!address,
    queryKey: ['pending-unstakes', address],
    queryFn: async () => {
      const { data } = await axios.get<PendingStakesResponse>('/api/unstake/pending', {
        params: { address },
      });

      const entries = data.entries
        .map((x) => ({
          ...x,
          amount: hasAmounts(x)
            ? new Big(x.amount).div(new Big(10).pow(protocol.rune.decimals)).toNumber()
            : 0,
          sAmount: hasAmounts(x)
            ? new Big(x.sAmount).div(new Big(10).pow(protocol.staked.decimals)).toNumber()
            : 0,
          confirmations: hasBlockHeight(x.status) ? data.last_block - x.status.block_height + 1 : 0,
          expectedConfirmations,
          claimedConfirmations:
            x.claimTx && hasBlockHeight(x.claimTx.status)
              ? data.last_block - x.claimTx.status.block_height + 1
              : 0,
        }))
        .filter((x) => x.claimedConfirmations < x.expectedConfirmations);

      return entries;
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
