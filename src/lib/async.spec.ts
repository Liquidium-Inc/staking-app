import { describe, expect, it } from 'vitest';

import { mapWithConcurrencyLimit } from './async';

describe('mapWithConcurrencyLimit', () => {
  it('preserves order and bounds in-flight work', async () => {
    let active = 0;
    let peak = 0;

    const results = await mapWithConcurrencyLimit([1, 2, 3, 4, 5, 6], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });

    expect(peak).toBe(2);
    expect(results).toEqual([2, 4, 6, 8, 10, 12].map((value) => ({ status: 'fulfilled', value })));
  });

  it('isolates rejected items', async () => {
    const results = await mapWithConcurrencyLimit([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error('failed');
      return value;
    });

    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1].status).toBe('rejected');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });
});
