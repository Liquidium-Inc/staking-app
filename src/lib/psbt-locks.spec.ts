import { Buffer } from 'buffer';

import * as bitcoin from 'bitcoinjs-lib';
import { describe, expect, it } from 'vitest';

import { getPsbtInputOutpoints, getPsbtInputOutpointsForAddress } from '@/lib/psbt-locks';

describe('getPsbtInputOutpointsForAddress', () => {
  it('returns only inputs controlled by the requested address', () => {
    const network = bitcoin.networks.testnet;
    const target = bitcoin.payments.p2wpkh({
      hash: Buffer.alloc(20, 1),
      network,
    });
    const other = bitcoin.payments.p2wpkh({
      hash: Buffer.alloc(20, 2),
      network,
    });
    const psbt = new bitcoin.Psbt({ network });

    psbt.addInput({
      hash: Buffer.alloc(32, 3),
      index: 0,
      witnessUtxo: { script: target.output!, value: 1_000n },
    });
    psbt.addInput({
      hash: Buffer.alloc(32, 4),
      index: 1,
      witnessUtxo: { script: other.output!, value: 1_000n },
    });

    expect(getPsbtInputOutpointsForAddress(psbt, target.address!, network)).toEqual([
      `${Buffer.alloc(32, 3).toString('hex')}:0`,
    ]);
  });

  it('returns every PSBT input outpoint when reserving a complete transaction', () => {
    const psbt = new bitcoin.Psbt()
      .addInput({
        hash: Buffer.alloc(32, 3),
        index: 0,
        witnessUtxo: { script: Buffer.from([0x51]), value: 1_000n },
      })
      .addInput({
        hash: Buffer.alloc(32, 4),
        index: 1,
        witnessUtxo: { script: Buffer.from([0x51]), value: 2_000n },
      });

    expect(getPsbtInputOutpoints(psbt)).toEqual([
      `${Buffer.alloc(32, 3).toString('hex')}:0`,
      `${Buffer.alloc(32, 4).toString('hex')}:1`,
    ]);
  });
});
