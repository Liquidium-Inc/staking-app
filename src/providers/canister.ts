import { HttpAgent, Actor } from '@dfinity/agent';
import { Secp256k1KeyIdentity } from '@dfinity/identity-secp256k1';
import { trace } from '@opentelemetry/api';
import * as bitcoin from 'bitcoinjs-lib';

import { config } from '@/config/config';
import { config as publicConfig } from '@/config/public';
import { spanWrap } from '@/lib/tracing';

import { idlFactory } from './__generated__/did';
import { CanisterMockedService } from './canister.local';

const tracer = trace.getTracer('providers-cansiter');
const INDEXER_RETRY_MESSAGE = 'error: out of sync: indexer out of sync';
const INDEXER_RETRY_ATTEMPTS = 3;
const INDEXER_RETRY_DELAY_MS = 10_000;

type CanisterMethod = 'stake' | 'unstake' | 'withdraw';

interface CanisterResponse {
  signed_psbt: string;
  debug: unknown;
  error?: string;
}

const testnet4 = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
} satisfies bitcoin.Network;

export class CanisterService {
  private static createActor(canisterId: string, host = 'https://icp-api.io', secret?: string) {
    if (!secret) {
      const agent = HttpAgent.createSync({ host, fetch });
      return Actor.createActor(idlFactory, { agent, canisterId });
    }
    const { buffer } = Uint8Array.from(Buffer.from(secret, 'hex'));
    const identity = Secp256k1KeyIdentity.fromSecretKey(buffer);
    const agent = HttpAgent.createSync({ host, fetch, identity });
    return Actor.createActor(idlFactory, { agent, canisterId });
  }

  constructor(
    public id: string,
    public address: string,
    public retention: string,
    public network = bitcoin.networks.bitcoin,
    private oracleSecret = '',
    private host = 'https://icp-api.io',
    private actor = CanisterService.createActor(id, host),
    private oracle = CanisterService.createActor(id, host, oracleSecret),
  ) {}

  private async call(method: CanisterMethod, psbt: string, attempt = 1): Promise<CanisterResponse> {
    return await spanWrap(tracer, method, async (span) => {
      const result = await this.oracle[method](psbt);
      const parsed = parseCanisterResponse(method, result);

      if (this.shouldRetryIndexerSync(parsed.error) && attempt < INDEXER_RETRY_ATTEMPTS) {
        span.addEvent('canister-indexer-out-of-sync', { attempt });
        await this.delay(INDEXER_RETRY_DELAY_MS);
        return await this.call(method, psbt, attempt + 1);
      }

      return parsed;
    });
  }

  stake = this.call.bind(this, 'stake');
  unstake = this.call.bind(this, 'unstake');
  withdraw = this.call.bind(this, 'withdraw');

  async getExchangeRate() {
    return await spanWrap(tracer, 'getExchangeRate', async () => {
      const result = (await this.actor.get_exchange_rate_components()) as {
        Ok: bigint[];
        Err: string;
      };
      if (result.Err) throw new Error(result.Err);
      const [circulating, balance] = result.Ok.map((v: bigint | undefined) => BigInt(v ?? 0));
      return { circulating, balance };
    });
  }

  async pushExchangeRate(circulating: bigint, balance: bigint) {
    return await spanWrap(tracer, 'pushExchangeRate', async () => {
      return await this.oracle.update_exchange_rate(circulating, balance);
    });
  }

  async getUnstakeUtxos(): Promise<UnstakeUtxo[]> {
    return await spanWrap(tracer, 'getUnstakeUtxos', async () => {
      return (await this.actor.get_unstake_utxos()) as UnstakeUtxo[];
    });
  }

  private shouldRetryIndexerSync(error?: string): boolean {
    if (!error) return false;
    return error.trim().toLowerCase().includes(INDEXER_RETRY_MESSAGE);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export interface UnstakeUtxo {
  utxo: string;
  timestamp: bigint;
  prev_utxos: string[];
}

const network = publicConfig.network === 'testnet4' ? testnet4 : bitcoin.networks.bitcoin;

export const canister = !config.canister.isMocked
  ? new CanisterService(
      config.canister.id,
      config.canister.address,
      config.canister.retentionAddress,
      network,
      config.secrets.oracle,
      config.icp.host,
    )
  : new CanisterMockedService(config.canister.secret, config.canister.retentionSecret, network);

function parseCanisterResponse(method: CanisterMethod, payload: unknown): CanisterResponse {
  if (typeof payload !== 'string') {
    throw new Error('Invalid PSBT Result');
  }

  const trimmed = payload.trim();
  if (!trimmed) {
    throw new Error('Invalid PSBT Result');
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Parsed value is not an object');
    }

    const record = parsed as Record<string, unknown>;
    const signedPsbtRaw = record['signed_psbt'];
    const debug = record['debug'] ?? null;
    const errorValue = record['error'];
    const error = typeof errorValue === 'string' ? errorValue : undefined;

    const signed_psbt = typeof signedPsbtRaw === 'string' ? signedPsbtRaw : '';

    if (error) {
      return { signed_psbt, debug, error };
    }

    if (!signed_psbt) {
      throw new Error('signed_psbt missing');
    }

    return { signed_psbt, debug };
  } catch (error) {
    if (trimmed.toLowerCase().startsWith('error:')) {
      return {
        signed_psbt: '',
        debug: null,
        error: trimmed,
      };
    }

    const snippet = trimmed.slice(0, 200);
    throw new Error(`Canister ${method} response parse failed: ${snippet}`, { cause: error });
  }
}
