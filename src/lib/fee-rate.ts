import type * as bitcoin from 'bitcoinjs-lib';

import { mempool } from '@/providers/mempool';

export const MAX_FEE_RATE_SATS_PER_VBYTE = 500;
export const MAX_ABSOLUTE_FEE_SATS = 1_000_000n;

export class FeeRateResolutionError extends Error {
  constructor(message = 'Fee rate estimation failed', options?: ErrorOptions) {
    super(message, options);
    this.name = 'FeeRateResolutionError';
  }
}

export class FeePolicyError extends Error {
  constructor(message = 'Fee exceeds protocol policy') {
    super(message);
    this.name = 'FeePolicyError';
  }
}

export function assertFeeRateWithinPolicy(feeRate: number) {
  if (
    !Number.isFinite(feeRate) ||
    !Number.isInteger(feeRate) ||
    feeRate < 1 ||
    feeRate > MAX_FEE_RATE_SATS_PER_VBYTE
  ) {
    throw new FeePolicyError(
      `Fee rate must be an integer between 1 and ${MAX_FEE_RATE_SATS_PER_VBYTE} sat/vbyte`,
    );
  }
  return feeRate;
}

export function assertAbsoluteFeeWithinPolicy(fee: bigint) {
  if (fee < 0n || fee > MAX_ABSOLUTE_FEE_SATS) {
    throw new FeePolicyError(`Absolute fee exceeds ${MAX_ABSOLUTE_FEE_SATS} sats`);
  }
}

export function calculatePsbtFee(psbt: bitcoin.Psbt) {
  const inputValue = psbt.data.inputs.reduce((total, input) => {
    if (!input.witnessUtxo) throw new FeePolicyError('PSBT input value is unavailable');
    return total + input.witnessUtxo.value;
  }, 0n);
  const outputValue = psbt.txOutputs.reduce((total, output) => total + output.value, 0n);
  return inputValue - outputValue;
}

export const resolveFeeRate = async (providedFeeRate?: number) => {
  if (providedFeeRate != null) return assertFeeRateWithinPolicy(providedFeeRate);

  try {
    const feeResponse = await mempool.fees.getFeesRecommended();
    return assertFeeRateWithinPolicy(feeResponse.fastestFee + 1);
  } catch (error) {
    throw new FeeRateResolutionError('Fee rate estimation failed', {
      cause: error instanceof Error ? error : undefined,
    });
  }
};
