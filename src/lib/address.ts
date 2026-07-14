import { Buffer } from 'buffer';

import * as bitcoin from 'bitcoinjs-lib';

import { getBitcoinNetwork } from '@/lib/bitcoin-network';

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

export function publicKeyOwnsAddress(
  publicKeyHex: string,
  address: string,
  network: bitcoin.Network = getBitcoinNetwork(),
): boolean {
  const publicKey = Buffer.from(publicKeyHex, 'hex');
  const candidates: string[] = [];

  try {
    const taproot = bitcoin.payments.p2tr({ pubkey: bitcoin.toXOnly(publicKey), network }).address;
    if (taproot) candidates.push(taproot);
  } catch {}

  if (publicKey.length !== 32) {
    try {
      const segwit = bitcoin.payments.p2wpkh({ pubkey: publicKey, network });
      if (segwit.address) candidates.push(segwit.address);
      const nestedSegwit = bitcoin.payments.p2sh({ redeem: segwit, network }).address;
      if (nestedSegwit) candidates.push(nestedSegwit);
    } catch {}
  }

  return candidates.some((candidate) => addressesMatch(candidate, address, network));
}
