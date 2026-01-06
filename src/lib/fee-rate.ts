import { mempool } from '@/providers/mempool';

export class FeeRateResolutionError extends Error {
  constructor(message = 'Fee rate estimation failed', options?: ErrorOptions) {
    super(message, options);
    this.name = 'FeeRateResolutionError';
  }
}

export const resolveFeeRate = async (providedFeeRate?: number) => {
  if (providedFeeRate != null) return providedFeeRate;

  try {
    const feeResponse = await mempool.fees.getFeesRecommended();
    return feeResponse.fastestFee + 1;
  } catch (error) {
    throw new FeeRateResolutionError('Fee rate estimation failed', {
      cause: error instanceof Error ? error : undefined,
    });
  }
};
