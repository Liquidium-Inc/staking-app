import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import { describe, expect, it } from 'vitest';

import { findPublicKeyForAddress, publicKeyOwnsAddress } from '@/lib/address';

const network = bitcoin.networks.testnet;
const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

describe('publicKeyOwnsAddress', () => {
  it('accepts an x-only taproot public key', () => {
    const publicKey = ECPair.makeRandom({ network }).publicKey;
    const xOnly = bitcoin.toXOnly(publicKey);
    const address = bitcoin.payments.p2tr({ pubkey: xOnly, network }).address;

    expect(publicKeyOwnsAddress(Buffer.from(xOnly).toString('hex'), address || '', network)).toBe(
      true,
    );
  });

  it('accepts an x-only BIP86 taproot internal public key', () => {
    const publicKey = ECPair.makeRandom({ network }).publicKey;
    const xOnly = bitcoin.toXOnly(publicKey);
    const address = bitcoin.payments.p2tr({ internalPubkey: xOnly, network }).address;

    expect(publicKeyOwnsAddress(Buffer.from(xOnly).toString('hex'), address || '', network)).toBe(
      true,
    );
  });

  it('accepts a compressed SegWit payment public key', () => {
    const publicKey = ECPair.makeRandom({ network }).publicKey;
    const address = bitcoin.payments.p2wpkh({ pubkey: publicKey, network }).address;

    expect(
      publicKeyOwnsAddress(Buffer.from(publicKey).toString('hex'), address || '', network),
    ).toBe(true);
  });

  it('rejects a key that does not own the address', () => {
    const publicKey = ECPair.makeRandom({ network }).publicKey;
    const otherPublicKey = ECPair.makeRandom({ network }).publicKey;
    const address = bitcoin.payments.p2wpkh({ pubkey: otherPublicKey, network }).address;

    expect(
      publicKeyOwnsAddress(Buffer.from(publicKey).toString('hex'), address || '', network),
    ).toBe(false);
  });

  it('accepts an x-only key for a native SegWit address via parity expansion', () => {
    const publicKey = ECPair.makeRandom({ network }).publicKey;
    const xOnly = Buffer.from(publicKey).subarray(1);
    const address = bitcoin.payments.p2wpkh({ pubkey: publicKey, network }).address;

    expect(publicKeyOwnsAddress(xOnly.toString('hex'), address || '', network)).toBe(true);
  });

  it('accepts an x-only key for a nested SegWit address via parity expansion', () => {
    const publicKey = ECPair.makeRandom({ network }).publicKey;
    const xOnly = Buffer.from(publicKey).subarray(1);
    const segwit = bitcoin.payments.p2wpkh({ pubkey: publicKey, network });
    const address = bitcoin.payments.p2sh({ redeem: segwit, network }).address;

    expect(publicKeyOwnsAddress(xOnly.toString('hex'), address || '', network)).toBe(true);
  });

  it('findPublicKeyForAddress returns the compressed key for an x-only SegWit key', () => {
    const publicKey = ECPair.makeRandom({ network }).publicKey;
    const xOnly = Buffer.from(publicKey).subarray(1);
    const address = bitcoin.payments.p2wpkh({ pubkey: publicKey, network }).address;

    expect(findPublicKeyForAddress(xOnly.toString('hex'), address || '', network)).toBe(
      Buffer.from(publicKey).toString('hex'),
    );
  });
});
