import Big from 'big.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

import { computeEarnings, INSUFFICIENT_EARNINGS_SLOTS_MESSAGE } from './earnings.ts';

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
  const expectBig = (value: Big, expected: string) => {
    expect(value.toString()).toBe(expected);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work in simple cases', async () => {
    const values = [{ block: 100, value: new Big(10) }];
    const apys = [
      { block: 0, value: new Big(1) },
      { block: 200, value: new Big(2) },
    ];

    const result = computeEarnings(values, apys);

    expectBig(result.realized, '0');
    expectBig(result.unrealized, '10');
    expectBig(result.total, '10');
    expectBig(result.invested, '10');
    expectBig(result.percentage, '100');
  });

  it('calculates realized and unrealized earnings correctly', async () => {
    const values = [
      { block: 100, value: new Big(10) },
      { block: 200, value: new Big(5) },
      { block: 300, value: new Big(-8) },
    ];

    const apys = [
      { block: 100, value: new Big('0.05') },
      { block: 200, value: new Big('0.07') },
      { block: 300, value: new Big('0.1') },
    ];

    const result = computeEarnings(values, apys);

    expectBig(result.realized, '0.4');
    expectBig(result.unrealized, '0.25');
    expectBig(result.total, '0.65');
    expectBig(result.invested, '0.85');
    expectBig(result.percentage, '9.28571428571428571429');
  });

  it('keeps decimal-heavy flows exact', async () => {
    const values = [
      { block: 100, value: new Big('0.3') },
      { block: 200, value: new Big('0.2') },
      { block: 300, value: new Big('-0.1') },
    ];

    const apys = [
      { block: 100, value: new Big('0.1') },
      { block: 200, value: new Big('0.2') },
      { block: 300, value: new Big('0.3') },
      { block: 400, value: new Big('0.4') },
    ];

    const result = computeEarnings(values, apys);

    expectBig(result.realized, '0.02');
    expectBig(result.unrealized, '0.1');
    expectBig(result.total, '0.12');
    expectBig(result.invested, '0.07');
    expectBig(result.percentage, '30');
  });

  it('throws error when no APY found for block', () => {
    const values = [{ block: 100, value: new Big(10) }];
    const apys = [{ block: 200, value: new Big('0.05') }];

    expect(() => computeEarnings(values, apys)).toThrow('No rate found for block 100');
  });

  it('throws error when no rates are provided', () => {
    expect(() => computeEarnings([], [])).toThrow('No rates provided');
  });

  it('throws error when not enough slots to cover withdrawal', async () => {
    const values = [
      { block: 100, value: new Big(10) },
      { block: 200, value: new Big(-20) },
    ];

    const apys = [
      { block: 100, value: new Big('0.05') },
      { block: 200, value: new Big('0.07') },
    ];

    expect(() => computeEarnings(values, apys)).toThrow(
      new RegExp(`${INSUFFICIENT_EARNINGS_SLOTS_MESSAGE} of 20`),
    );
  });
});
