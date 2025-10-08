import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

import { computeEarnings } from './earnings.ts';

vi.mock('yocto-queue', () => {
  return {
    __esModule: true,
    default: class MockQueue<T> {
      private items: T[] = [];

      enqueue(item: T): void {
        this.items.push(item);
      }

      dequeue(): T | undefined {
        return this.items.shift();
      }

      peek(): T | undefined {
        return this.items[0];
      }

      *[Symbol.iterator]() {
        for (const item of this.items) {
          yield item;
        }
      }
    },
  };
});

describe('computeEarnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work in simple cases', async () => {
    const values = [{ block: 100, value: 10 }];
    const apys = [
      { block: 0, value: 1 },
      { block: 200, value: 2 },
    ];

    const result = computeEarnings(values, apys);
    expect(result).toMatchObject({
      realized: 0,
      unrealized: 10,
      total: 10,
      invested: 10,
      percentage: 100,
    });
  });

  it('calculates realized and unrealized earnings correctly', async () => {
    const values = [
      { block: 100, value: 10 },
      { block: 200, value: 5 },
      { block: 300, value: -8 },
    ];

    const apys = [
      { block: 100, value: 0.05 },
      { block: 200, value: 0.07 },
      { block: 300, value: 0.1 },
    ];

    const result = computeEarnings(values, apys);

    expect(result).toMatchObject({
      realized: 0.4, // (8 * (0.10 - 0.05)) = 0.4
      unrealized: 0.25, // (10-8) * (0.10 - 0.05) + 5 * (0.10 - 0.07) = 0.1 + 0.15 = 0.25
      total: 0.65, // 0.4 + 0.25
      invested: 0.8500000000000001, // 10 * 0.05 + 5 * 0.07 = 0.5 + 0.35 = 0.85
      percentage: 9.285714285714286, // (0.65 * 100) / 7 (total tokens remaining)
    });
  });

  it('handles multiple deposits and withdrawals', async () => {
    const values = [
      { block: 100, value: 100 },
      { block: 200, value: 50 },
      { block: 300, value: -30 },
      { block: 400, value: -70 },
    ];

    const apys = [
      { block: 100, value: 0.05 },
      { block: 200, value: 0.06 },
      { block: 300, value: 0.07 },
      { block: 400, value: 0.08 },
      { block: 500, value: 0.1 },
    ];

    const result = computeEarnings(values, apys);

    expect(result).toEqual(
      expect.objectContaining({
        realized: expect.any(Number),
        unrealized: expect.any(Number),
      }),
    );
  });

  it('throws error when no APY found for block', () => {
    const values = [{ block: 100, value: 10 }];
    const apys = [{ block: 200, value: 0.05 }];

    expect(() => computeEarnings(values, apys)).toThrow('No rate found for block 100');
  });

  it.skip('throws error when not enough slots to cover withdrawal', async () => {
    const values = [
      { block: 100, value: 10 },
      { block: 200, value: -20 },
    ];

    const apys = [
      { block: 100, value: 0.05 },
      { block: 200, value: 0.07 },
    ];

    expect(() => computeEarnings(values, apys)).toThrow(/No enough slots to cover/);
  });
});
