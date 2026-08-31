import { Buffer } from 'buffer';

import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';

import { getBitcoinNetwork } from '@/lib/bitcoin-network';

// p2tr derivation needs the ECC library; client bundles never initialize it
// elsewhere, so do it here for both server and browser consumers.
bitcoin.initEccLib(ecc);

function toOutputScript(address: string, network: bitcoin.Network): Buffer {
  return Buffer.from(bitcoin.address.toOutputScript(address.trim(), network));
}

export function addressesMatch(
  a?: string | null,
  b?: string | null,
  network: bitcoin.Network = getBitcoinNetwork(),
): boolean {
  if (!a || !b) return false;
  const normalizedA = a.trim();
  const normalizedB = b.trim();
  try {
    const scriptA = toOutputScript(normalizedA, network);
    const scriptB = toOutputScript(normalizedB, network);
    return scriptA.equals(scriptB);
  } catch {
    return normalizedA === normalizedB;
  }
}

/**
 * Returns the public key (hex) that owns the given address, or undefined.
 *
 * Wallets don't always hand us the key in the form we need: taproot keys may
 * be internal or output keys and arrive x-only (32 bytes) or compressed (33
 * bytes), while some wallets return x-only keys even for SegWit payment
 * addresses. For x-only keys we try both parities, so the returned key is
 * always a usable 33-byte compressed key for SegWit/nested-SegWit addresses.
 */
export function findPublicKeyForAddress(
  publicKeyHex: string,
  address: string,
  network: bitcoin.Network = getBitcoinNetwork(),
): string | undefined {
  const publicKey = Buffer.from(publicKeyHex, 'hex');

  if (publicKey.length !== 32 && publicKey.length !== 33) return undefined;

  try {
    const xOnlyPublicKey = bitcoin.toXOnly(publicKey);
    const taprootCandidates = [
      bitcoin.payments.p2tr({ internalPubkey: xOnlyPublicKey, network }).address,
      bitcoin.payments.p2tr({ pubkey: xOnlyPublicKey, network }).address,
    ];
    if (
      taprootCandidates.some(
        (candidate) => candidate && addressesMatch(candidate, address, network),
      )
    )
      return publicKey.toString('hex');
  } catch {}

  const compressedForms =
    publicKey.length === 33
      ? [publicKey]
      : [
          Buffer.concat([Buffer.from([2]), publicKey]),
          Buffer.concat([Buffer.from([3]), publicKey]),
        ];

  for (const form of compressedForms) {
    try {
      const segwit = bitcoin.payments.p2wpkh({ pubkey: form, network });
      if (segwit.address && addressesMatch(segwit.address, address, network))
        return form.toString('hex');
      const nestedSegwit = bitcoin.payments.p2sh({ redeem: segwit, network }).address;
      if (nestedSegwit && addressesMatch(nestedSegwit, address, network))
        return form.toString('hex');
    } catch {}
  }

  return undefined;
}

export function publicKeyOwnsAddress(
  publicKeyHex: string,
  address: string,
  network: bitcoin.Network = getBitcoinNetwork(),
): boolean {
  return findPublicKeyForAddress(publicKeyHex, address, network) !== undefined;
}
