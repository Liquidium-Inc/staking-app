import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';

import { config } from '@/config/config';
import { config as publicConfig } from '@/config/public';

import { CanisterService } from './canister';

type PublicMethods<T> = {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};

export class CanisterMockedService implements PublicMethods<CanisterService> {
  public host = '';
  private realCanister: CanisterService | null = null;

  constructor(
    secret: string,
    retentionSecret: string,
    public network = bitcoin.networks.bitcoin,
    private canisterWallet = CanisterMockedService.deriveWallet(secret, network),
    private retentionWallet = CanisterMockedService.deriveWallet(retentionSecret, network),
    public id = '',
    public address = canisterWallet.address,
    public retention = retentionWallet.address,
  ) {}

  private getRealCanister() {
    if (!this.realCanister && !config.canister.isMocked) {
      const testnet4 = {
        messagePrefix: '\x18Bitcoin Signed Message:\n',
        bech32: 'tb',
        bip32: { public: 0x043587cf, private: 0x04358394 },
        pubKeyHash: 0x6f,
        scriptHash: 0xc4,
        wif: 0xef,
      } satisfies bitcoin.Network;

      const network = publicConfig.network === 'testnet4' ? testnet4 : bitcoin.networks.bitcoin;
      this.realCanister = new CanisterService(
        config.canister.id,
        config.canister.address,
        config.canister.retentionAddress,
        network,
        config.secrets.oracle,
        config.icp.host,
      );
    }
    return this.realCanister!;
  }

  private static deriveWallet(secret: string, network = bitcoin.networks.bitcoin) {
    const secretKey = Buffer.from(secret, 'hex');
    const ECPair = ECPairFactory(ecc);
    const keyPair = ECPair.fromPrivateKey(secretKey, { network });
    const { address } = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
    if (!address) throw new Error('Invalid address');
    return { address, publicKey: Buffer.from(keyPair.publicKey).toString('hex'), keyPair };
  }

  private async sign(psbtBase64: string) {
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64);

    for (let i = 0; i < psbt.data.inputs.length; i++) {
      const input = psbt.data.inputs[i];
      const inputAddress = bitcoin.address.fromOutputScript(
        input.witnessUtxo?.script ?? Uint8Array.from([]),
        this.network,
      );
      if (inputAddress === this.canisterWallet.address) {
        psbt.signInput(i, this.canisterWallet.keyPair);
        psbt.finalizeInput(i);
      }
      if (inputAddress === this.retentionWallet.address) {
        psbt.signInput(i, this.retentionWallet.keyPair);
        psbt.finalizeInput(i);
      }
    }

    return {
      signed_psbt: psbt.toBase64(),
      debug: {},
      error: undefined,
    };
  }

  stake = this.sign.bind(this);
  unstake = this.sign.bind(this);
  withdraw = this.sign.bind(this);

  async getExchangeRate() {
    // In test environment or if canister is mocked, use mock data
    if (process.env.NODE_ENV === 'test' || config.canister.isMocked) {
      return {
        circulating: BigInt(1000),
        balance: BigInt(1000),
      };
    }

    // Call the real canister to get actual exchange rate data
    return this.getRealCanister().getExchangeRate();
  }

  async getExchangeRateDecimal() {
    // In test or mocked mode, return a stable decimal value
    if (process.env.NODE_ENV === 'test' || config.canister.isMocked) {
      return 1;
    }
    return this.getRealCanister().getExchangeRateDecimal();
  }

  pushExchangeRate = async () => {
    throw new Error('Not implemented');
  };

  async getUnstakeUtxos() {
    // In test environment or if canister is mocked, use mock data
    if (process.env.NODE_ENV === 'test' || config.canister.isMocked) {
      return [];
    }

    // Call the real canister to get actual exchange rate data
    return this.getRealCanister().getUnstakeUtxos();
  }
}
