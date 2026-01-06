import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import Big from 'big.js';

import { SATOSHIS_PER_BTC } from '@/lib/bitcoin-units';

const BTC_BALANCE_ENDPOINT = '/api/account/btc-balance';

type BtcBalanceResponse = {
  address: string;
  balance_btc: string;
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
      const balanceBtc = new Big(data.balance_sats).div(SATOSHIS_PER_BTC);

      return balanceBtc.toNumber();
    },
    staleTime: 60 * 1000,
    enabled: !!address,
  });
};
