import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { ECPairFactory } from 'ecpair';
import { vi, describe, it, expect } from 'vitest';

import { config } from '@/config/public';
import { RunePSBT, RunePSBTInput } from '@/lib/psbt';
import { canister } from '@/providers/canister';
import { mempool } from '@/providers/mempool';

import { BroadcastService } from './broadcast';

type CanisterWithWallet = {
  canisterWallet?: {
    publicKey?: string;
  };
};

const getCanisterWalletPublicKey = () =>
  (canister as CanisterWithWallet).canisterWallet?.publicKey ?? 'deadbeef';

vi.mock('@/db', () => ({
  db: {
    stake: { insert: vi.fn().mockImplementation(() => undefined) },
    unstake: { insert: vi.fn().mockImplementation(() => undefined) },
  },
}));
vi.mock('@/providers/redis', () => ({
  redis: {
    utxo: {
      lock: vi.fn().mockImplementation(() => Promise.resolve(true)),
      extend: vi.fn().mockImplementation(() => Promise.resolve(true)),
      free: vi.fn().mockImplementation(() => Promise.resolve(true)),
    },
  },
}));
vi.mock('@/providers/mempool', () => ({
  mempool: {
    transactions: {
      postTx: vi.fn().mockImplementation(() => Promise.resolve(undefined)),
    },
  },
}));

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

const randomHex = (length = 64) => {
  const bytes = new Uint8Array(length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Buffer.from(bytes).toString('hex');
};

const makeInput = (payload: Partial<RunePSBTInput>): RunePSBTInput => ({
  hash: randomHex(64),
  index: Math.floor(Math.random() * 10),
  address: '',
  publicKey: '',
  value: 546n,
  block_height: 0,
  runes: {},
  ...payload,
});

describe('BroadcastService', () => {
  const user = getUser();

  describe('stake', () => {
    it('should be able to create a new instance', () => {
      const service = new BroadcastService(new bitcoin.Psbt(), 'stake');
      expect(service).toBeInstanceOf(BroadcastService);
    });

    describe('InvalidExchangeRate', () => {
      it('should throw InvalidExchangeRate error when exchange rate is invalid', async () => {
        const rune = new RunePSBT(bitcoin.networks.testnet);
        rune.addInput(
          makeInput({
            address: canister.address,
            publicKey: getCanisterWalletPublicKey(),
            runes: { [config.sRune.id]: BigInt(2477788) },
          }),
          makeInput({ ...user, runes: { [config.rune.id]: BigInt(7312) } }),
        );
        rune.setPayer(makeInput({ ...user, address: user.paymentAddress, value: 43728n }));
        rune.addOutput(
          { ...canister, value: 546n, runes: { [config.sRune.id]: 2476788n }, isPointer: true },
          { ...canister, value: 546n, runes: { [config.rune.id]: 500n } }, // User gives 500 runes
          { ...user, value: 546n, runes: { [config.rune.id]: 6812n } },
          { ...user, value: 546n, runes: { [config.sRune.id]: 1000n } }, // But receives 1000 staked runes (invalid - too much)
        );
        const psbt = await rune.build(2);
        psbt.signInput(1, user.keyPair);
        psbt.signInput(2, user.keyPair);
        const service = new BroadcastService(psbt, 'stake');
        await expect(service.broadcast()).rejects.toThrow(BroadcastService.InvalidExchangeRate);
      });
    });

    describe('broadcast', () => {
      it('should broadcast a valid PSBT', async () => {
        const rune = new RunePSBT(bitcoin.networks.testnet);
        rune.addInput(
          makeInput({
            address: canister.address,
            publicKey: getCanisterWalletPublicKey(),
            runes: { [config.sRune.id]: BigInt(2477788) },
          }),
          makeInput({ ...user, runes: { [config.rune.id]: BigInt(7312) } }),
        );
        rune.setPayer(makeInput({ ...user, address: user.paymentAddress, value: 43728n }));
        rune.addOutput(
          { ...canister, value: 546n, runes: { [config.sRune.id]: 2476801n }, isPointer: true },
          { ...canister, value: 546n, runes: { [config.rune.id]: 1000n } },
          { ...user, value: 546n, runes: { [config.rune.id]: 6312n } },
          { ...user, value: 546n, runes: { [config.sRune.id]: 987n } },
        );
        const psbt = await rune.build(2);
        psbt.signInput(1, user.keyPair);
        psbt.signInput(2, user.keyPair);
        const service = new BroadcastService(psbt, 'stake');
        const result = await service.broadcast();
        expect(mempool.transactions.postTx).toHaveBeenCalledWith({ txhex: result.tx });
        expect(result).toBeDefined();
      });
    });
  });

  describe('unstake', () => {
    it('should be able to create a new instance', () => {
      const service = new BroadcastService(new bitcoin.Psbt(), 'unstake');
      expect(service).toBeInstanceOf(BroadcastService);
    });
  });
});
