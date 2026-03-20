import { config } from '@/config/public';
import { BIS } from '@/providers/bestinslot';
import { liquidiumApi } from '@/providers/liquidium-api';
import { ordiscan } from '@/providers/ordiscan';
import { resolveRunePriceUsd } from '@/services/rune-price';

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
  event_type: 'output' | 'input';
  outpoint: string;
  amount: string;
  timestamp: string;
  rune_id: string;
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
type WalletActivityQuery = AddressId &
  Partial<RuneId> &
  Partial<SortBy<'ts'>> & { runes_filter_only_wallet?: boolean; newerThan?: Date };

export interface RuneProvider {
  runes: {
    walletBalances(
      params: AddressId & Partial<SortBy<'total_balance'>>,
    ): Promise<{ data: WalletBalance[]; block_height: number }>;
    holders(
      params: RuneId & Partial<SortBy<'balance'>>,
    ): Promise<{ data: RuneHolder[]; block_height: number }>;
    walletActivity(
      params: WalletActivityQuery,
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
    walletActivity: async (params: WalletActivityQuery) => {
      const requestedRune = resolveKnownRune(params);
      if (!requestedRune) {
        return { data: [], block_height: 0 };
      }

      const offset = params.offset ?? 0;
      const count = params.count ?? 2000;
      const sort = params.order === 'asc' ? 'oldest' : 'newest';
      const newerThan = params.newerThan?.valueOf();
      const collected: WalletActivity[] = [];
      let page = 1;

      while (collected.length < offset + count) {
        const { data: transactions } = await ordiscan.rune.walletActivity(params.address, {
          page,
          sort,
        });

        if (transactions.length === 0) break;

        let reachedOlderTransactions = false;

        for (const transaction of transactions) {
          const transactionTime = new Date(transaction.timestamp).valueOf();
          if (sort === 'newest' && newerThan && transactionTime < newerThan) {
            reachedOlderTransactions = true;
            continue;
          }

          collected.push(
            ...flattenWalletActivity(params.address, requestedRune, transaction).filter((entry) => {
              if (!newerThan) return true;
              return new Date(entry.timestamp).valueOf() >= newerThan;
            }),
          );

          if (collected.length >= offset + count) break;
        }

        if (transactions.length < 100 || reachedOlderTransactions) break;
        page += 1;
      }

      return {
        data: collected.slice(offset, offset + count),
        block_height: 0,
      };
    },
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

/**
 * Returns the LIQ token USD price, preferring CoinGecko and falling back to rune market data.
 */
export async function getRunePrice(): Promise<number> {
  return await resolveRunePriceUsd({
    runeName: config.rune.name,
  });
}

type KnownRune = {
  id: string;
  name: string;
  decimals: number;
};

const KNOWN_RUNES: KnownRune[] = [
  {
    id: config.rune.id,
    name: config.rune.name,
    decimals: config.rune.decimals,
  },
  {
    id: config.sRune.id,
    name: config.sRune.name,
    decimals: config.sRune.decimals,
  },
];

/**
 * Resolves supported app runes from the mixed rune query formats used by the provider API.
 */
function resolveKnownRune(params: Partial<RuneId>): KnownRune | undefined {
  if ('rune_id' in params && params.rune_id) {
    return KNOWN_RUNES.find((rune) => rune.id === params.rune_id);
  }

  if ('rune_name' in params && params.rune_name) {
    return KNOWN_RUNES.find((rune) => rune.name === params.rune_name);
  }

  return undefined;
}

/**
 * Flattens Ordiscan transaction-level rune activity into the app's simple in/out event model.
 */
function flattenWalletActivity(
  address: string,
  rune: KnownRune,
  transaction: Awaited<ReturnType<typeof ordiscan.rune.walletActivity>>['data'][number],
): WalletActivity[] {
  const inputs = transaction.inputs
    .filter((input) => input.address === address && input.rune === rune.name)
    .map((input) => ({
      event_type: 'input' as const,
      outpoint: input.output,
      amount: input.rune_amount,
      timestamp: transaction.timestamp,
      rune_id: rune.id,
      decimals: rune.decimals,
    }));

  const outputs = transaction.outputs
    .filter((output) => output.address === address && output.rune === rune.name)
    .map((output) => ({
      event_type: 'output' as const,
      outpoint: `${transaction.txid}:${output.vout}`,
      amount: output.rune_amount,
      timestamp: transaction.timestamp,
      rune_id: rune.id,
      decimals: rune.decimals,
    }));

  return [...inputs, ...outputs];
}
