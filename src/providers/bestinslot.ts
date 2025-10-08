import { trace } from '@opentelemetry/api';
import axios from 'axios';

import { config } from '@/config/config';
import { spanWrap } from '@/lib/tracing';

const { token, url: baseUrl } = config.bestInSlot;

const tracer = trace.getTracer('providers-bestinslot');

const api = axios.create({
  baseURL: baseUrl,
  headers: { 'x-api-key': token },
});

type RuneId = { rune_id: string } | { rune_name: string } | { rune_number: number };
type AddressId = { address: string } | { pkscript: string };

type SortBy<T> = { sort_by: T; order?: 'asc' | 'desc'; offset?: number; count?: number };

async function getWalletBalances(params: AddressId & Partial<SortBy<'total_balance'>>) {
  return await spanWrap(tracer, 'getWalletBalances', async () => {
    const { data } = await api.get<{
      data: Array<{
        pkscript: string;
        wallet_addr: string;
        rune_id: string;
        total_balance: string;
        rune_name: string;
        spaced_rune_name: string;
        decimals: number;
        avg_unit_price_in_sats: number;
        min_listed_unit_price_in_sats: number;
        min_listed_unit_price_unisat: number;
      }>;
      block_height: number;
    }>(`/v3/runes/wallet_balances`, { params });
    return data;
  });
}

async function getRuneHolders(params: RuneId & Partial<SortBy<'balance'>>) {
  return await spanWrap(tracer, 'getRuneHolders', async () => {
    params.sort_by ??= 'balance';
    params.order ??= 'desc';
    params.offset ??= 0;
    params.count ??= 100;
    const { data } = await api.get<{
      data: Array<{
        pkscript: string;
        wallet_addr: string;
        rune_id: string;
        total_balance: string;
        rune_name: string;
        spaced_rune_name: string;
        decimals: number;
      }>;
      block_height: number;
    }>(`/v3/runes/holders`, { params });
    return data;
  });
}

async function getRunesActivity(
  params: AddressId &
    Partial<RuneId> &
    Partial<SortBy<'ts'>> & { runes_filter_only_wallet?: boolean },
) {
  return await spanWrap(tracer, 'getRunesActivity', async () => {
    params.sort_by ??= 'ts';
    params.order ??= 'desc';
    params.offset ??= 0;
    params.count ??= 2000;
    params.runes_filter_only_wallet ??= true;
    const { data } = await api.get<{
      data: Array<{
        event_type: 'output' | 'input' | 'mint' | 'new-allocation' | 'burn';
        txid: string;
        outpoint: string;
        pkscript: string;
        wallet_addr: string;
        rune_id: string;
        amount: string;
        block_height: number;
        block_timestamp: string;
        rune_name: string;
        spaced_rune_name: string;
        decimals: number;
        sale_info: null | {
          sale_price: number;
          sold_to_pkscript: string;
          sold_to_wallet_addr: string;
          marketplace: string;
        };
        icon_content_url: string;
        icon_render_url: null;
      }>;
      block_height: number;
    }>(`/v3/runes/wallet_activity`, { params });
    return data;
  });
}

async function getMempoolRunicUTXOs(params: { wallet_addr: string }) {
  return await spanWrap(tracer, 'getMempoolRunicUTXOs', async () => {
    const { data } = await api.get<{
      data: Array<{
        txid: string;
        vout: number;
        block_height: number;
        value: string;
        address: string;
        script: string;
        script_type: string;
        inscriptions_ids: string[] | null;
        satpoints: null;
        rune_ids: string[] | null;
        amounts: string[];
        txfee: null;
        vsize: null;
        utxo: string;
      }>;
      block_height: number | null;
    }>(`/v3/mempool/runic_utxos_of_wallet`, { params });
    return data;
  });
}

async function getMempoolCardinalUTXOs(params: { wallet_addr: string }) {
  return await spanWrap(tracer, 'getMempoolCardinalUTXOs', async () => {
    const { data } = await api.get<{
      data: Array<{
        txid: string;
        vout: number;
        block_height: number;
        value: string;
        address: string;
        script: string;
        script_type: string;
        inscriptions_ids: null;
        satpoints: null;
        rune_ids: null;
        amounts: null;
        txfee: null;
        vsize: null;
        utxo: string;
      }>;
      block_height: number | null;
    }>(`/v3/mempool/cardinal_utxos_of_wallet`, { params });
    return data;
  });
}

async function getRuneTicker(params: RuneId) {
  return await spanWrap(tracer, 'getRuneTicker', async () => {
    const { data } = await api.get<{
      data: {
        rune_id: string;
        rune_number: string;
        rune_name: string;
        spaced_rune_name: string;
        symbol: string;
        decimals: number;
        per_mint_amount: string;
        mint_cnt: string;
        mint_cnt_limit: string;
        premined_supply: string;
        total_minted_supply: string;
        burned_supply: string;
        circulating_supply: string;
        mint_progress: number;
        mint_start_block: null | number;
        mint_end_block: null | number;
        genesis_block: number;
        deploy_ts: string;
        deploy_txid: string;
        auto_upgrade: boolean;
        holder_count: number;
        event_count: number;
        mintable: boolean;
        icon_inscr_ib: null | string;
        icon_delegate_id: null | string;
        icon_content_url: null | string;
        icon_render_url: null | string;
        avg_unit_price_in_sats: null | number;
        min_listed_unit_price_in_sats: null | number;
        min_listed_unit_price_unisat: null | number;
        listed_supply: number;
        listed_supply_ratio: number;
        marketcap: null | number;
        total_sale_info: {
          sale_count: number;
          sale_count_3h: number;
          sale_count_6h: number;
          sale_count_9h: number;
          sale_count_12h: number;
          sale_count_1d: number;
          sale_count_3d: number;
          sale_count_7d: number;
          sale_count_30d: number;
          sale_amount: number;
          vol_3h: number;
          vol_6h: number;
          vol_9h: number;
          vol_12h: number;
          vol_1d: number;
          vol_3d: number;
          vol_7d: number;
          vol_30d: number;
          vol_total: number;
        };
      };
      block_height: number;
    }>(`/v3/runes/ticker_info`, { params });
    return data;
  });
}
export const BIS = {
  runes: {
    walletBalances: getWalletBalances,
    holders: getRuneHolders,
    walletActivity: getRunesActivity,
    ticker: getRuneTicker,
  },
  mempool: {
    runicUTXOs: getMempoolRunicUTXOs,
    cardinalUTXOs: getMempoolCardinalUTXOs,
  },
};
