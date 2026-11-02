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
    expectBig(result.percentage, '76.47058823529411764706');
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
    expectBig(result.percentage, '171.42857142857142857143');
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

  it('prices long-held stakes at their entry rate and reports % of LIQ cost basis', () => {
    // [date, LIQ staked, sLIQ received] for a long-time staker whose first stake predates
    // the 30-day full-resolution rate window.
    const stakes: Array<[string, string, string]> = [
      ['2025-09-24', '1239.81', '1238.67'],
      ['2026-08-03', '20466.36', '17328.33'],
      ['2026-08-08', '6146.09', '5199.47'],
      ['2026-08-21', '11958.42', '10068.75'],
      ['2026-08-22', '9504.82', '7997.28'],
      ['2026-08-26', '25024.88', '21002.00'],
      ['2026-08-27', '54920.96', '46069.70'],
      ['2026-08-29', '10384.79', '8703.45'],
      ['2026-09-01', '21205.63', '17731.87'],
      ['2026-09-02', '28243.24', '23609.64'],
      ['2026-09-18', '14428.98', '11998.88'],
      ['2026-09-19', '8634.80', '7180.54'],
    ];
    const values = stakes.map(([date, , sliq]) => ({
      block: new Date(`${date}T12:00:00Z`).valueOf(),
      value: new Big(sliq),
    }));
    const rates = [
      { block: 0, value: new Big(1) },
      ...stakes.map(([date, liq, sliq]) => ({
        block: new Date(`${date}T00:00:00Z`).valueOf(),
        value: new Big(liq).div(sliq),
      })),
      { block: Number.POSITIVE_INFINITY, value: new Big('1.2259') },
    ];

    const result = computeEarnings(values, rates);

    expect(result.invested.toFixed(2)).toBe('212158.78');
    expect(result.total.toFixed(0)).toBe('6209');
    expect(result.percentage.toFixed(2)).toBe('2.93');
  });
});
