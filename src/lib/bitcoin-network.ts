import * as bitcoin from 'bitcoinjs-lib';

import { config as publicConfig } from '@/config/public';

const testnet4: bitcoin.Network = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

const networks: Record<typeof publicConfig.network, bitcoin.Network> = {
  mainnet: bitcoin.networks.bitcoin,
  testnet4,
};

export function getBitcoinNetwork(): bitcoin.Network {
  return networks[publicConfig.network];
}
