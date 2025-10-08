import { useLaserEyes } from '@omnisat/lasereyes-react';
import { useQuery } from '@tanstack/react-query';
import Big from 'big.js';

/**
 * Fetches BTC balance for the connected wallet.
 * Note: The getBalance() method from LaserEyes always returns the connected wallet's balance,
 * regardless of the address parameter. The address is used only for query caching consistency.
 * @param address - Connected wallet address (used for query caching only)
 */
export const useBtcBalance = (address: string) => {
  const { getBalance } = useLaserEyes();

  return useQuery({
    queryKey: ['btc-balance', address],
    queryFn: async () => {
      if (!address) return 0;

      const balanceSats = await getBalance();
      const balanceBtc = new Big(balanceSats).div(100_000_000);

      return balanceBtc.toNumber();
    },
    staleTime: 60 * 1000,
    enabled: !!address,
  });
};
