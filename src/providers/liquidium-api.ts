import { trace } from '@opentelemetry/api';
import axios, { AxiosInstance } from 'axios';

import { config } from '@/config/config';
import { spanWrap } from '@/lib/tracing';

const tracer = trace.getTracer('providers-liquidium');

export class LiquidiumAPI {
  private axios: AxiosInstance;
  constructor(
    readonly baseUrl: string,
    readonly token: string,
  ) {
    this.axios = axios.create({
      baseURL: `${baseUrl}/api/internal/bitcoin/`,
      headers: {
        'x-api-key': token,
      },
    });
  }

  async runeOutputs(address: string): Promise<RuneOutputResponse> {
    return await spanWrap(tracer, 'runeOutputs', async (span) => {
      span.setAttribute('address', address);

      return await this.axios.get(`/address/${address}/outputs/rune`).then((r) => r.data);
    });
  }

  async paymentOutputs(address: string): Promise<PaymentOutputResponse> {
    return await spanWrap(tracer, 'paymentOutputs', async (span) => {
      span.setAttribute('address', address);

      return await this.axios.get(`/address/${address}/outputs/payment`).then((r) => r.data);
    });
  }

  async runeBalance(address: string): Promise<RuneBalanceResponse> {
    return await spanWrap(tracer, 'runeBalance', async (span) => {
      span.setAttribute('address', address);

      return await this.axios.get(`/address/${address}/balance/rune`).then((r) => r.data);
    });
  }
}

type WithHeight<T> = {
  data: T;
  block_height: number;
};

type RuneOutputResponse = WithHeight<
  {
    wallet_addr: string;
    output: string;
    rune_ids: string[];
    balances: string[];
    rune_names: string[];
    spaced_rune_name: string[];
    decimals: number[];
    confirmations: number;
    value: number;
  }[]
>;

type PaymentOutputResponse = WithHeight<
  {
    output: string;
    value: number;
    confirmations: number;
  }[]
>;

type RuneBalanceResponse = WithHeight<
  {
    wallet_addr: string;
    rune_id: string;
    total_balance: string;
    rune_name: string;
    decimals: number;
  }[]
>;

if (!config.liquidium.url || !config.liquidium.token) {
  throw new Error('Missing Liquidium API config');
}

export const liquidiumApi = new LiquidiumAPI(config.liquidium.url, config.liquidium.token);
