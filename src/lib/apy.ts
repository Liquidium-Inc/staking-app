import Big from 'big.js';

import { logger } from '@/lib/logger';

export type HistoricRatePoint = { timestamp: Date; block: number; rate: number };

export function computeApyFromHistoric(historicRates: HistoricRatePoint[]): {
  yearly: number;
  monthly: number;
  daily: number;
  window: number;
} {
  if (!historicRates || historicRates.length < 2) {
    return { yearly: 0, monthly: 0, daily: 0, window: 0 };
  }

  const lastRate = historicRates[historicRates.length - 1];
  const totalTimeSpan = lastRate.timestamp.getTime() - historicRates[0].timestamp.getTime();
  const targetTimeSpan = Math.max(
    24 * 60 * 60 * 1000,
    Math.min(30 * 24 * 60 * 60 * 1000, totalTimeSpan),
  );

  let referenceRate = historicRates[0];
  for (let i = historicRates.length - 1; i >= 0; i--) {
    const diff = lastRate.timestamp.getTime() - historicRates[i].timestamp.getTime();
    if (diff >= targetTimeSpan) {
      referenceRate = historicRates[i];
      break;
    }
  }

  const diffDays = Math.round(
    (lastRate.timestamp.getTime() - referenceRate.timestamp.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (referenceRate.rate === 0 || diffDays <= 0) {
    return { yearly: 0, monthly: 0, daily: 0, window: diffDays };
  }

  try {
    const ratio = Big(lastRate.rate).div(referenceRate.rate).toNumber();
    const yearlyRate = Math.pow(ratio, 365 / diffDays) - 1;
    if (!Number.isFinite(yearlyRate)) {
      return { yearly: 0, monthly: 0, daily: 0, window: diffDays };
    }
    return {
      yearly: yearlyRate,
      monthly: Math.pow(1 + yearlyRate, 1 / 12) - 1,
      daily: Math.pow(1 + yearlyRate, 1 / 365) - 1,
      window: diffDays,
    };
  } catch (error) {
    logger.error('APY calculation failed:', error);
    return { yearly: 0, monthly: 0, daily: 0, window: 0 };
  }
}
