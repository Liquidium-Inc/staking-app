import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Big from 'big.js';

const BTC_BALANCE_ENDPOINT = '/api/account/btc-balance';

type BtcBalanceResponse = {
  balance_sats: string;
};

/**
 * Fetches BTC balance for the connected wallet.
 * Note: The address is used for query caching consistency.
 * @param address - Connected wallet address (used for query caching only)
 */
export const useBtcBalance = (address: string) => {
  return useQuery({
    queryKey: ['btc-balance', address],
    queryFn: async () => {
      if (!address) return 0;

      const { data } = await axios.get<BtcBalanceResponse>(BTC_BALANCE_ENDPOINT, {
        params: { address },
      });
      const balanceBtc = new Big(data.balance_sats).div(100_000_000);

      return balanceBtc.toNumber();
    },
    staleTime: 60 * 1000,
    enabled: !!address,
  });
};
