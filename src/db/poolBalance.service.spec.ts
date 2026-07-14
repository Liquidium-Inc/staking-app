import { describe, test, expect, beforeEach, vi } from 'vitest';

import { sql } from './client';
import { poolBalance } from './poolBalance.service';
import { poolBalances } from './schema';

const mocks = vi.hoisted(() => ({
  values: vi.fn(),
  from: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  drizzle: {
    desc: vi.fn((col) => ({ type: 'desc', column: col })),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
      {
        raw: vi.fn(),
      },
    ),
  },
}));

// Mock drizzle-orm functions
vi.mock('drizzle-orm', () => ({
  desc: mocks.drizzle.desc,
  sql: mocks.drizzle.sql,
}));

// Mock the sql client
vi.mock('./client', () => ({
  sql: {
    insert: vi.fn(() => ({
      values: mocks.values,
      onConflictDoUpdate: mocks.onConflictDoUpdate,
    })),
    select: vi.fn(() => ({
      from: mocks.from,
      orderBy: mocks.orderBy,
    })),
  },
}));

describe('poolBalance service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.onConflictDoUpdate });
    mocks.onConflictDoUpdate.mockResolvedValue(undefined);
    mocks.from.mockReturnValue({ orderBy: mocks.orderBy });
    mocks.orderBy.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([]);
  });

  describe('insert', () => {
    test('should insert pool balance with conflict handling', async () => {
      const balanceData = {
        staked: '1000',
        balance: '5000',
        block: 1000,
      };

      await poolBalance.insert(balanceData.staked, balanceData.balance, balanceData.block);

      expect(sql.insert).toHaveBeenCalledWith(poolBalances);
      expect(mocks.values).toHaveBeenCalledWith(balanceData);
      expect(mocks.onConflictDoUpdate).toHaveBeenCalledWith({
        target: poolBalances.block,
        set: {
          staked: balanceData.staked,
          balance: balanceData.balance,
        },
      });
    });
  });

  describe('getHistoric', () => {
    test('should get historic pool balances ordered by block', async () => {
      const mockBalances = [
        { staked: '1000', balance: '5000', block: 1000 },
        { staked: '2000', balance: '6000', block: 1001 },
      ];

      mocks.limit.mockResolvedValue([...mockBalances].reverse());

      const result = await poolBalance.getHistoric();

      expect(result).toEqual(mockBalances);
      expect(sql.select).toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalledWith(poolBalances);
      expect(mocks.orderBy).toHaveBeenCalledWith({ type: 'desc', column: poolBalances.block });
      expect(mocks.limit).toHaveBeenCalledWith(4320);
    });
  });
});
