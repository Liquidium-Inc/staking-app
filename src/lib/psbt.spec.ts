import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import { describe, expect, test } from 'vitest';

import { RunePSBT } from './psbt';

const network = bitcoin.networks.testnet;

const randomAddress = () =>
  bitcoin.payments.p2wpkh({
    pubkey: ECPairFactory(ecc).makeRandom({ network }).publicKey,
    network,
  }).address!;

describe('RunePSBT', () => {
  test('keeps an explicit output value and pays the fee from the payer', async () => {
    const owner = randomAddress();
    const payer = randomAddress();

    const psbt = await new RunePSBT(network)
      .setPayer({
        hash: 'b'.repeat(64),
        index: 0,
        address: payer,
        publicKey: '',
        value: 100_000n,
        runes: {},
      })
      .addInput({
        hash: 'a'.repeat(64),
        index: 0,
        address: randomAddress(),
        publicKey: '',
        value: 2_000n,
        runes: {},
      })
      .addOutput({ isPointer: true, address: owner, value: 2_000n, runes: {} })
      .build(1);

    const [, ownerOutput, changeOutput] = psbt.txOutputs;
    expect(ownerOutput.address).toBe(owner);
    expect(ownerOutput.value).toBe(2_000n);
    expect(changeOutput.address).toBe(payer);
    expect(changeOutput.value).toBe(99_000n);
  });
});
