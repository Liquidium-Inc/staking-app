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
