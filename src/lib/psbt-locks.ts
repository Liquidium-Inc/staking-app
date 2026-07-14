import { Buffer } from 'buffer';

import * as bitcoin from 'bitcoinjs-lib';

import { addressesMatch } from '@/lib/address';

export function getPsbtInputOutpointsForAddress(
  psbt: bitcoin.Psbt,
  targetAddress: string,
  network: bitcoin.Network,
): string[] {
  return psbt.txInputs.flatMap((input, index) => {
    const script = psbt.data.inputs[index].witnessUtxo?.script;
    if (!script) return [];

    try {
      const inputAddress = bitcoin.address.fromOutputScript(script, network);
      if (!addressesMatch(inputAddress, targetAddress, network)) return [];
      return [`${Buffer.from(input.hash).reverse().toString('hex')}:${input.index}`];
    } catch {
      return [];
    }
  });
}
