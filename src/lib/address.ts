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
 * arrive x-only (32 bytes) or compressed (33 bytes), and Taproot wallets may
 * report either the internal or output key. Some wallets also return x-only
 * keys for SegWit payment addresses. For x-only SegWit keys we try both
 * parities, so the returned key is always a usable compressed key.
 */
export function findPublicKeyForAddress(
  publicKeyHex: string,
  address: string,
  network: bitcoin.Network = getBitcoinNetwork(),
): string | undefined {
  const publicKey = Buffer.from(publicKeyHex, 'hex');

  if (publicKey.length !== 32 && publicKey.length !== 33) return undefined;

  try {
    const taproot = bitcoin.payments.p2tr({ pubkey: bitcoin.toXOnly(publicKey), network }).address;
    if (taproot && addressesMatch(taproot, address, network)) return publicKey.toString('hex');
  } catch {}

  try {
    const taproot = bitcoin.payments.p2tr({
      internalPubkey: bitcoin.toXOnly(publicKey),
      network,
    }).address;
    if (taproot && addressesMatch(taproot, address, network)) return publicKey.toString('hex');
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

export enum BitcoinAddressType {
  P2TR = 'p2tr',
  P2WPKH = 'p2wpkh',
  P2WSH = 'p2wsh',
  P2SH = 'p2sh',
  P2PKH = 'p2pkh',
  Unknown = 'unknown',
}

// Inputs the PSBT builder can sign for: Taproot, native SegWit and nested SegWit (P2SH-P2WPKH).
export const SUPPORTED_ADDRESS_TYPES: ReadonlySet<BitcoinAddressType> = new Set([
  BitcoinAddressType.P2TR,
  BitcoinAddressType.P2WPKH,
  BitcoinAddressType.P2SH,
]);

const P2WPKH_PROGRAM_BYTES = 20;
const P2WSH_PROGRAM_BYTES = 32;

export function getBitcoinAddressType(
  address: string,
  network: bitcoin.Network = getBitcoinNetwork(),
): BitcoinAddressType {
  const trimmed = address.trim();
  try {
    const { version, data } = bitcoin.address.fromBech32(trimmed);
    if (version === 1) return BitcoinAddressType.P2TR;
    if (version === 0 && data.length === P2WPKH_PROGRAM_BYTES) return BitcoinAddressType.P2WPKH;
    if (version === 0 && data.length === P2WSH_PROGRAM_BYTES) return BitcoinAddressType.P2WSH;
    return BitcoinAddressType.Unknown;
  } catch {}

  try {
    const { version } = bitcoin.address.fromBase58Check(trimmed);
    if (version === network.scriptHash) return BitcoinAddressType.P2SH;
    if (version === network.pubKeyHash) return BitcoinAddressType.P2PKH;
  } catch {}

  return BitcoinAddressType.Unknown;
}
