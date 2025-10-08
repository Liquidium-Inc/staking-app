import { BIS } from '@/providers/bestinslot';
import { liquidiumApi } from '@/providers/liquidium-api';

export interface RuneMarketData {
  price_in_sats: number;
}

export interface WalletBalance {
  rune_id: string;
  total_balance: string;
}

export interface RuneHolder {
  wallet_addr: string;
  total_balance: string;
}

export interface WalletActivity {
  event_type: 'output' | 'input' | 'mint' | 'new-allocation' | 'burn';
  outpoint: string;
  amount: string;
  block_height: number;
  decimals: number;
}

export interface RuneTicker {
  spaced_rune_name: string;
  symbol: string;
  decimals: number;
  total_minted_supply: string;
  avg_unit_price_in_sats: null | number;
}

export interface RunicUTXO {
  txid: string;
  vout: number;
  block_height: number;
  value: string;
  address: string;
  rune_ids: string[] | null;
  amounts: string[];
}

export interface CardinalUTXO {
  txid: string;
  vout: number;
  block_height: number;
  value: string;
  address: string;
}

export type RuneId = { rune_id: string } | { rune_name: string } | { rune_number: number };
export type AddressId = { address: string };
export type SortBy<T> = { sort_by: T; order?: 'asc' | 'desc'; offset?: number; count?: number };

export interface RuneProvider {
  runes: {
    walletBalances(
      params: AddressId & Partial<SortBy<'total_balance'>>,
    ): Promise<{ data: WalletBalance[]; block_height: number }>;
    holders(
      params: RuneId & Partial<SortBy<'balance'>>,
    ): Promise<{ data: RuneHolder[]; block_height: number }>;
    walletActivity(
      params: AddressId &
        Partial<RuneId> &
        Partial<SortBy<'ts'>> & { runes_filter_only_wallet?: boolean },
    ): Promise<{ data: WalletActivity[]; block_height: number }>;
  };
  mempool: {
    runicUTXOs(params: {
      wallet_addr: string;
    }): Promise<{ data: RunicUTXO[]; block_height: number | null }>;
    cardinalUTXOs(params: {
      wallet_addr: string;
    }): Promise<{ data: CardinalUTXO[]; block_height: number | null }>;
  };
}

class CentralizedRuneProvider implements RuneProvider {
  runes = {
    walletBalances: async (params: AddressId & Partial<SortBy<'total_balance'>>) => {
      // return await BIS.runes.walletBalances(params);

      const balances = await liquidiumApi.runeBalance(params.address);
      return {
        data: balances.data.map((item) => ({
          rune_id: item.rune_id,
          total_balance: item.total_balance,
        })),
        block_height: balances.block_height,
      };
    },
    holders: (params: RuneId & Partial<SortBy<'balance'>>) => BIS.runes.holders(params),
    walletActivity: (
      params: AddressId &
        Partial<RuneId> &
        Partial<SortBy<'ts'>> & { runes_filter_only_wallet?: boolean },
    ) => BIS.runes.walletActivity(params),
  };

  mempool = {
    runicUTXOs: async (params: { wallet_addr: string }) => {
      // return BIS.mempool.runicUTXOs(params);

      const utxos = await liquidiumApi.runeOutputs(params.wallet_addr);
      return {
        data: utxos.data.map((utxo) => ({
          txid: utxo.output.split(':').at(0)!,
          vout: Number(utxo.output.split(':').at(1)!),
          block_height: utxos.block_height - utxo.confirmations + 1,
          value: utxo.value.toFixed(),
          address: utxo.wallet_addr,
          rune_ids: utxo.rune_ids,
          amounts: utxo.balances,
        })),
        block_height: utxos.block_height,
      };
    },
    cardinalUTXOs: async (params: { wallet_addr: string }) => {
      // return BIS.mempool.cardinalUTXOs(params);

      const utxos = await liquidiumApi.paymentOutputs(params.wallet_addr);
      return {
        data: utxos.data.map((utxo) => ({
          txid: utxo.output.split(':').at(0)!,
          vout: Number(utxo.output.split(':').at(1)!),
          block_height: utxos.block_height - utxo.confirmations + 1,
          value: utxo.value.toFixed(),
          address: params.wallet_addr,
        })),
        block_height: utxos.block_height,
      };
    },
  };
}

export const runeProvider = new CentralizedRuneProvider();

export const {
  runes: {
    walletBalances: getWalletBalances,
    holders: getRuneHolders,
    walletActivity: getWalletActivity,
  },
  mempool: { runicUTXOs: getMempoolRunicUTXOs, cardinalUTXOs: getMempoolCardinalUTXOs },
} = runeProvider;
