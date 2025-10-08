import { afterEach } from 'node:test';

import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { ECPairFactory } from 'ecpair';
import { vi, describe, test, expect } from 'vitest';

import { config as publicConfig } from '@/config/public';
import { RunePSBTInput } from '@/lib/psbt';
import { canister } from '@/providers/canister';

import { PSBTService } from './psbt';

const getUser = () => {
  const network = bitcoin.networks.testnet;
  const ECPair = ECPairFactory(ecc);
  const keyPair = ECPair.makeRandom({ network });
  const paymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network }).address;
  const address = bitcoin.payments.p2tr({ pubkey: toXOnly(keyPair.publicKey), network }).address;
  return {
    keyPair: keyPair,
    publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
    address: address || '',
    paymentAddress: paymentAddress || '',
    network,
  };
};

const mocks = vi.hoisted(() => {
  return {
    runeOutputs: vi.fn(),
    paymentOutputs: vi.fn(),
  };
});

vi.mock('@/providers/liquidium-api', () => ({ liquidiumApi: mocks }));
vi.mock('@/providers/redis', () => ({
  redis: {
    utxo: {
      lock: vi.fn().mockImplementation(() => Promise.resolve(true)),
      extend: vi.fn().mockImplementation(() => Promise.resolve(true)),
      free: vi.fn().mockImplementation(() => Promise.resolve(true)),
    },
  },
}));

const randomHex = (length = 64) => {
  const bytes = new Uint8Array(length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Buffer.from(bytes).toString('hex');
};

describe('PSBTService', () => {
  const user = getUser();

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('sorting criteria', () => {
    const method = PSBTService['sortingCriteria'].bind(this, (input) => input.value);
    test('should sort by amount when no block-data', () => {
      const inputs = [{ value: 1000n }, { value: 500n }, { value: 1500n }] as RunePSBTInput[];
      const sorted = inputs.sort(method);
      expect(sorted).toEqual([{ value: 500n }, { value: 1000n }, { value: 1500n }]);
    });

    test('should sort by amount when block-data is present', () => {
      const inputs = [
        { value: 1000n, block_height: 3 },
        { value: 500n, block_height: 2 },
        { value: 1500n, block_height: 1 },
      ] as RunePSBTInput[];
      const sorted = inputs.sort(method);
      expect(sorted).toEqual([
        { value: 500n, block_height: 2 },
        { value: 1000n, block_height: 3 },
        { value: 1500n, block_height: 1 },
      ]);
    });

    test('should put element with block-data at the end', () => {
      const inputs = [
        { value: 1000n, block_height: 3 },
        { value: 500n, block_height: 2 },
        { value: 1500n },
      ] as RunePSBTInput[];
      const sorted = inputs.sort(method);
      expect(sorted).toEqual([
        { value: 1500n },
        { value: 500n, block_height: 2 },
        { value: 1000n, block_height: 3 },
      ]);
    });
  });

  describe('build', () => {
    test('should be able to build a PSBT', async () => {
      const runeId = publicConfig.rune.id;
      const stakedId = publicConfig.sRune.id;

      mocks.runeOutputs.mockImplementation(async (address) => {
        if (address === canister.address) {
          return {
            data: [
              {
                wallet_addr: canister.address,
                output: `${randomHex(64)}:0`,
                rune_ids: [stakedId],
                balances: ['1000'],
                rune_names: ['STAKED'],
                spaced_rune_name: ['STAKED'],
                decimals: [8],
                confirmations: 99,
                value: 546,
              },
              {
                wallet_addr: canister.address,
                output: `${randomHex(64)}:1`,
                rune_ids: [stakedId],
                balances: ['2000'],
                rune_names: ['STAKED'],
                spaced_rune_name: ['STAKED'],
                decimals: [8],
                confirmations: 98,
                value: 546,
              },
            ],
            block_height: 100,
          };
        }
        return {
          data: [
            {
              wallet_addr: user.address,
              output: `${randomHex(64)}:0`,
              rune_ids: [runeId],
              balances: ['1000'],
              rune_names: ['TEST'],
              spaced_rune_name: ['TEST'],
              decimals: [8],
              confirmations: 99,
              value: 546,
            },
          ],
          block_height: 100,
        };
      });
      mocks.paymentOutputs.mockImplementation(async () => {
        return {
          data: [
            {
              output: `${randomHex(64)}:0`,
              value: 10000000,
              confirmations: 99,
            },
          ],
          block_height: 100,
        };
      });

      const psbtService = new PSBTService(
        { address: user.address, public: user.publicKey, amount: 1000n, rune_id: runeId },
        { address: canister.address, amount: 500n, rune_id: stakedId },
        { address: user.address, public: user.publicKey },
        canister.network,
        1,
      );
      const response = await psbtService.build();
      expect(response).toBeDefined();
      expect(response.psbt).toBeDefined();

      const psbt = bitcoin.Psbt.fromBase64(response.psbt);
      expect(psbt.data.inputs.length).toBeGreaterThan(0);
      expect(psbt.data.outputs.length).toBeGreaterThan(0);
    });
  });
});
