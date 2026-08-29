import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import { describe, expect, it } from 'vitest';

import { resolveSigningKeys } from '@/lib/wallet-keys';

const network = bitcoin.networks.testnet;
const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

function makeAccounts() {
  const ordinalsKey = ECPair.makeRandom({ network }).publicKey;
  const paymentKey = ECPair.makeRandom({ network }).publicKey;
  const ordinalsXOnly = Buffer.from(ordinalsKey).subarray(1);
  const address = bitcoin.payments.p2tr({ pubkey: ordinalsXOnly, network }).address || '';
  const segwit = bitcoin.payments.p2wpkh({ pubkey: paymentKey, network });
  const paymentAddress = bitcoin.payments.p2sh({ redeem: segwit, network }).address || '';
  return {
    ordinalsKey: Buffer.from(ordinalsKey).toString('hex'),
    ordinalsXOnly: ordinalsXOnly.toString('hex'),
    paymentKey: Buffer.from(paymentKey).toString('hex'),
    address,
    paymentAddress,
  };
}

describe('resolveSigningKeys', () => {
  it('keeps correctly paired keys unchanged', () => {
    const accounts = makeAccounts();

    const resolved = resolveSigningKeys({
      address: accounts.address,
      paymentAddress: accounts.paymentAddress,
      publicKey: accounts.ordinalsKey,
      paymentPublicKey: accounts.paymentKey,
    });

    expect(resolved.senderPublicKey).toBe(accounts.ordinalsKey);
    expect(resolved.payerPublicKey).toBe(accounts.paymentKey);
  });

  it('swaps keys back when the wallet reports them in the wrong order (Xverse mobile)', () => {
    const accounts = makeAccounts();

    const resolved = resolveSigningKeys({
      address: accounts.address,
      paymentAddress: accounts.paymentAddress,
      publicKey: accounts.paymentKey,
      paymentPublicKey: accounts.ordinalsXOnly,
    });

    expect(resolved.senderPublicKey).toBe(accounts.ordinalsXOnly);
    expect(resolved.payerPublicKey).toBe(accounts.paymentKey);
  });

  it('expands an x-only payment key to the compressed key owning the payment address', () => {
    const accounts = makeAccounts();

    const resolved = resolveSigningKeys({
      address: accounts.address,
      paymentAddress: accounts.paymentAddress,
      publicKey: accounts.ordinalsXOnly,
      paymentPublicKey: Buffer.from(accounts.paymentKey, 'hex').subarray(1).toString('hex'),
    });

    expect(resolved.senderPublicKey).toBe(accounts.ordinalsXOnly);
    expect(resolved.payerPublicKey).toBe(accounts.paymentKey);
  });

  it('falls back to the wallet-reported keys when nothing matches', () => {
    const accounts = makeAccounts();
    const stranger = ECPair.makeRandom({ network }).publicKey;

    const resolved = resolveSigningKeys({
      address: accounts.address,
      paymentAddress: accounts.paymentAddress,
      publicKey: Buffer.from(stranger).toString('hex'),
      paymentPublicKey: Buffer.from(stranger).toString('hex'),
    });

    expect(resolved.senderPublicKey).toBe(Buffer.from(stranger).toString('hex'));
    expect(resolved.payerPublicKey).toBe(Buffer.from(stranger).toString('hex'));
  });
});
