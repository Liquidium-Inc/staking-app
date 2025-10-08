import { describe, test, expect, beforeEach, vi } from 'vitest';

import { sql } from './client';
import { stakes } from './schema';
import { stake } from './stake.service';

const mocks = vi.hoisted(() => ({
  values: vi.fn(),
  where: vi.fn(),
  from: vi.fn(),
  set: vi.fn(),
  drizzle: {
    and: vi.fn((a, b) => ({ type: 'and', conditions: [a, b] })),
    eq: vi.fn((col, val) => ({ type: 'eq', column: col, value: val })),
    isNull: vi.fn((col) => ({ type: 'isNull', column: col })),
    inArray: vi.fn((col, vals) => ({ type: 'inArray', column: col, values: vals })),
    or: vi.fn((...conditions) => ({ type: 'or', conditions })),
    gte: vi.fn((col, val) => ({ type: 'gte', column: col, value: val })),
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
  and: mocks.drizzle.and,
  eq: mocks.drizzle.eq,
  isNull: mocks.drizzle.isNull,
  inArray: mocks.drizzle.inArray,
  or: mocks.drizzle.or,
  gte: mocks.drizzle.gte,
  sql: mocks.drizzle.sql,
}));

// Mock the sql client
vi.mock('./client', () => ({
  sql: {
    insert: vi.fn(() => ({
      values: mocks.values,
    })),
    select: vi.fn(() => ({
      from: mocks.from,
    })),
    update: vi.fn(() => ({
      set: mocks.set,
    })),
  },
}));

describe('stake service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.values.mockResolvedValue(undefined);
    mocks.where.mockResolvedValue([]);
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.set.mockReturnValue({ where: mocks.where });
  });

  describe('insert', () => {
    test('should insert stake records', async () => {
      const stakeData = {
        address: 'test-address',
        txid: 'test-txid',
        amount: '1000',
        sAmount: '5000',
        timestamp: new Date(),
      };

      await stake.insert(stakeData);

      expect(sql.insert).toHaveBeenCalledWith(stakes);
      expect(mocks.values).toHaveBeenCalledWith([stakeData]);
    });
  });

  describe('getPendingsOf', () => {
    test('should get pending stakes for an address', async () => {
      const address = 'test-address';
      const mockPendingStakes = [
        {
          txid: 'test-txid',
          amount: '1000',
          sAmount: '5000',
          timestamp: new Date(),
        },
      ];

      mocks.where.mockResolvedValue(mockPendingStakes);

      const result = await stake.getPendingsOf(address);

      expect(result).toEqual(mockPendingStakes);
      expect(sql.select).toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalledWith(stakes);
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', column: stakes.address, value: address },
          { type: 'isNull', column: stakes.block },
        ],
      });
    });
  });

  describe('getAfterBlock', () => {
    test('should get stakes after specified block', async () => {
      const blockNumber = 1000;
      const mockStakes = [
        {
          id: 1,
          address: 'test-address',
          txid: 'test-txid',
          amount: '1000',
          sAmount: '5000',
          timestamp: new Date(),
          block: 1001,
        },
      ];

      mocks.where.mockResolvedValue(mockStakes);

      const result = await stake.getAfterBlock(blockNumber);

      expect(result).toEqual(mockStakes);
      expect(sql.select).toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalledWith(stakes);
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'or',
        conditions: [
          { type: 'isNull', column: stakes.block },
          { type: 'gte', column: stakes.block, value: blockNumber },
        ],
      });
    });
  });

  describe('update', () => {
    test('should update stake records', async () => {
      const ids = [1, 2];
      const updateData = {
        block: 1000,
      };

      await stake.update(ids, updateData);

      expect(sql.update).toHaveBeenCalledWith(stakes);
      expect(mocks.set).toHaveBeenCalledWith(updateData);
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'inArray',
        column: stakes.id,
        values: ids,
      });
    });
  });
});
