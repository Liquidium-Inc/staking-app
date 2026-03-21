import Big from 'big.js';
import Queue from 'yocto-queue';

import { binarySearch } from './binarySearch';

export interface EarningsEntry {
  block: number;
  value: Big;
}

export interface EarningsSlot {
  value: Big;
  block: number;
  rate: Big;
}

export interface EarningsResult {
  realized: Big;
  unrealized: Big;
  total: Big;
  percentage: Big;
  slots: Queue<EarningsSlot>;
  invested: Big;
  rate: Big;
}

/**
 * Computes the realized and unrealized earnings from a list of values and rates.
 * @param values - The list of values to compute earnings from.
 * @param rates - The list of rates to compute earnings from.
 * @returns The realized and unrealized earnings.
 */
export const computeEarnings = (
  values: EarningsEntry[],
  rates: EarningsEntry[],
): EarningsResult => {
  if (rates.length === 0) {
    throw new Error('No rates provided');
  }

  const zero = new Big(0);
  let realized = zero;
  let invested = zero;
  const slots = new Queue<EarningsSlot>();

  for (const { value, block } of values) {
    const rate = binarySearch(rates, (rate) => rate.block, block)?.value;
    if (rate === undefined) throw new Error('No rate found for block ' + block);

    if (value.gt(0)) {
      slots.enqueue({ value, block, rate });
      invested = invested.plus(value.times(rate));
    } else {
      let remainingValue = value.times(-1);
      while (remainingValue.gt(0)) {
        const slot = slots.peek();
        if (!slot) break;
        // TODO(DEV-2704): decide whether insufficient-slot withdrawals should throw or stay permissive,
        // then align callers and re-enable the matching spec before changing this behavior.
        if (slot.value.gt(remainingValue)) {
          slot.value = slot.value.minus(remainingValue);
          realized = realized.plus(remainingValue.times(rate.minus(slot.rate)));
          remainingValue = zero;
        } else {
          slots.dequeue();
          realized = realized.plus(slot.value.times(rate.minus(slot.rate)));
          remainingValue = remainingValue.minus(slot.value);
        }
      }
    }
  }

  const rate = rates[rates.length - 1].value;
  const unrealized = [...slots].reduce((acc, slot) => {
    return acc.plus(slot.value.times(rate.minus(slot.rate)));
  }, zero);

  const total = realized.plus(unrealized);
  const totalValue = [...slots].reduce((acc, slot) => acc.plus(slot.value), zero);
  const percentage = totalValue.gt(0)
    ? total.times(100).div(totalValue).round(Big.DP, Big.RM)
    : zero;

  return { realized, unrealized, total, percentage, slots, invested, rate };
};
