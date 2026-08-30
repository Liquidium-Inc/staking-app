import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import { describe, expect, it } from 'vitest';

import { WalletKeyPairing, resolveWalletKeyPairing } from '@/services/withdrawal-identity.service';

const network = bitcoin.networks.testnet;
const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

function makeAccounts() {
  const ordinalsKey = ECPair.makeRandom({ network }).publicKey;
  const paymentKey = ECPair.makeRandom({ network }).publicKey;
  const address = bitcoin.payments.p2tr({ pubkey: Buffer.from(ordinalsKey).subarray(1), network })
    .address as string;
  const paymentAddress = bitcoin.payments.p2wpkh({ pubkey: paymentKey, network }).address as string;
  return {
    sender: { address, public: Buffer.from(ordinalsKey).toString('hex') },
    payer: { address: paymentAddress, public: Buffer.from(paymentKey).toString('hex') },
  };
}

describe('resolveWalletKeyPairing', () => {
  it('returns the direct pairing when keys match their addresses', () => {
    const { sender, payer } = makeAccounts();

    const result = resolveWalletKeyPairing(sender, payer, network);

    expect(result.pairing).toBe(WalletKeyPairing.Direct);
    expect(result.senderKey).toBe(sender.public);
    expect(result.payerKey).toBe(payer.public);
  });

  it('accepts the swapped pairing when each key owns the other address', () => {
    const { sender, payer } = makeAccounts();

    const result = resolveWalletKeyPairing(
      { address: sender.address, public: payer.public },
      { address: payer.address, public: sender.public },
      network,
    );

    expect(result.pairing).toBe(WalletKeyPairing.Swapped);
    expect(result.senderKey).toBe(sender.public);
    expect(result.payerKey).toBe(payer.public);
  });

  it('returns unmatched without keys when nothing owns the addresses', () => {
    const { sender, payer } = makeAccounts();
    const stranger = Buffer.from(ECPair.makeRandom({ network }).publicKey).toString('hex');

    const result = resolveWalletKeyPairing(
      { address: sender.address, public: stranger },
      { address: payer.address, public: 'undefined' },
      network,
    );

    expect(result.pairing).toBe(WalletKeyPairing.Unmatched);
    expect(result.senderKey).toBeUndefined();
    expect(result.payerKey).toBeUndefined();
  });
});
