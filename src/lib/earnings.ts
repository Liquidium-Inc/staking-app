import Big from 'big.js';
import Queue from 'yocto-queue';

import { binarySearch } from './binarySearch';

interface Entry {
  block: number;
  value: number;
}

/**
 * Computes the realized and unrealized earnings from a list of values and rates.
 * @param values - The list of values to compute earnings from.
 * @param rates - The list of rates to compute earnings from.
 * @returns The realized and unrealized earnings.
 */
export const computeEarnings = (values: Entry[], rates: Entry[]) => {
  let realized = 0;
  let invested = 0;
  const slots = new Queue<{ value: number; block: number; rate: number }>();
  for (const { value, block } of values) {
    const rate = binarySearch(rates, (rate) => rate.block, block)?.value;

    if (rate !== 0 && !rate) throw new Error('No rate found for block ' + block);

    if (value > 0) {
      slots.enqueue({ value, block, rate });
      invested += value * rate;
    } else {
      let remainingValue = -value;
      while (remainingValue > 0) {
        const slot = slots.peek();
        if (!slot) break;
        // throw new Error(`No enough slots to cover ${value} (remaining: ${remainingValue})`);
        if (slot.value > remainingValue) {
          slot.value -= remainingValue;
          realized += remainingValue * (rate - slot.rate);
          remainingValue = 0;
        } else {
          slots.dequeue();
          realized += slot.value * (rate - slot.rate);
          remainingValue -= slot.value;
        }
      }
    }
  }

  const rate = rates[rates.length - 1].value;
  const unrealized = [...slots].reduce((acc, slot) => {
    return acc + slot.value * (rate - slot.rate);
  }, 0);

  const total = realized + unrealized;
  const totalValue = [...slots].reduce((acc, slot) => acc + slot.value, 0);
  const percentage = totalValue > 0 ? new Big(total).times(100).div(totalValue).toNumber() : 0;

  return { realized, unrealized, total, percentage, slots, invested, rate };
};
