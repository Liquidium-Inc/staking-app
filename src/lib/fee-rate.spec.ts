import * as bitcoin from 'bitcoinjs-lib';
import { describe, expect, it, vi } from 'vitest';

import { mempool } from '@/providers/mempool';

import {
  MAX_ABSOLUTE_FEE_SATS,
  MAX_FEE_RATE_SATS_PER_VBYTE,
  assertAbsoluteFeeWithinPolicy,
  assertFeeRateWithinPolicy,
  calculatePsbtFee,
  FeePolicyError,
  resolveFeeRate,
} from './fee-rate';

describe('fee policy', () => {
  it('accepts policy boundaries and rejects excessive fee rates', () => {
    expect(assertFeeRateWithinPolicy(1)).toBe(1);
    expect(assertFeeRateWithinPolicy(MAX_FEE_RATE_SATS_PER_VBYTE)).toBe(
      MAX_FEE_RATE_SATS_PER_VBYTE,
    );
    expect(() => assertFeeRateWithinPolicy(MAX_FEE_RATE_SATS_PER_VBYTE + 1)).toThrow(
      'Fee rate must be an integer',
    );
    expect(() => assertFeeRateWithinPolicy(0)).toThrow('Fee rate must be an integer');
  });

  it('calculates and enforces the absolute fee before finalization', () => {
    const psbt = new bitcoin.Psbt()
      .addInput({
        hash: '00'.repeat(32),
        index: 0,
        witnessUtxo: { script: Buffer.from([0x51]), value: 10_000n },
      })
      .addOutput({ script: Buffer.from([0x51]), value: 9_000n });

    expect(calculatePsbtFee(psbt)).toBe(1_000n);
    expect(() => assertAbsoluteFeeWithinPolicy(MAX_ABSOLUTE_FEE_SATS)).not.toThrow();
    expect(() => assertAbsoluteFeeWithinPolicy(MAX_ABSOLUTE_FEE_SATS + 1n)).toThrow(
      'Absolute fee exceeds',
    );
  });

  it('preserves policy errors from an unsafe fee estimate', async () => {
    vi.spyOn(mempool.fees, 'getFeesRecommended').mockResolvedValueOnce({
      fastestFee: MAX_FEE_RATE_SATS_PER_VBYTE,
      halfHourFee: 1,
      hourFee: 1,
      economyFee: 1,
      minimumFee: 1,
    });

    await expect(resolveFeeRate()).rejects.toBeInstanceOf(FeePolicyError);
  });
});
