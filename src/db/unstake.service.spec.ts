import { describe, test, expect, beforeEach, vi } from 'vitest';

import { sql } from './client';
import { unstakes } from './schema';
import { unstake } from './unstake.service';

const mocks = vi.hoisted(() => ({
  values: vi.fn(),
  where: vi.fn(),
  from: vi.fn(),
  set: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  drizzle: {
    and: vi.fn((...conditions) => ({ type: 'and', conditions })),
    eq: vi.fn((col, val) => ({ type: 'eq', column: col, value: val })),
    isNull: vi.fn((col) => ({ type: 'isNull', column: col })),
    isNotNull: vi.fn((col) => ({ type: 'isNotNull', column: col })),
    inArray: vi.fn((col, vals) => ({ type: 'inArray', column: col, values: vals })),
    or: vi.fn((...conditions) => ({ type: 'or', conditions })),
    gte: vi.fn((col, val) => ({ type: 'gte', column: col, value: val })),
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
  and: mocks.drizzle.and,
  eq: mocks.drizzle.eq,
  isNull: mocks.drizzle.isNull,
  isNotNull: mocks.drizzle.isNotNull,
  inArray: mocks.drizzle.inArray,
  or: mocks.drizzle.or,
  gte: mocks.drizzle.gte,
  desc: mocks.drizzle.desc,
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
      where: mocks.where,
      limit: mocks.limit,
    })),
    update: vi.fn(() => ({
      set: mocks.set,
      where: mocks.where,
    })),
  },
}));

describe('unstake service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.values.mockResolvedValue(undefined);
    mocks.where.mockReturnValue({ orderBy: mocks.orderBy });
    mocks.orderBy.mockReturnValue({ limit: mocks.limit });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.limit.mockResolvedValue([]);
  });

  describe('insert', () => {
    test('should insert unstake records', async () => {
      const unstakeData = {
        address: 'test-address',
        txid: 'test-txid',
        amount: '1000',
        sAmount: '5000',
        timestamp: new Date(),
      };

      await unstake.insert(unstakeData);

      expect(sql.insert).toHaveBeenCalledWith(unstakes);
      expect(mocks.values).toHaveBeenCalledWith([unstakeData]);
    });
  });

  describe('getPendingsOf', () => {
    test('should get pending unstakes for an address', async () => {
      const address = 'test-address';
      const mockPendingUnstakes = [
        {
          txid: 'test-txid',
          amount: '1000',
          sAmount: '5000',
          timestamp: new Date(),
          claimTx: null,
          claimTxBlock: null,
        },
      ];

      mocks.limit.mockResolvedValue(mockPendingUnstakes);

      const result = await unstake.getPendingsOf(address);

      expect(result).toEqual(mockPendingUnstakes);
      expect(sql.select).toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalledWith(unstakes);
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', column: unstakes.address, value: address },
          { type: 'isNull', column: unstakes.claimTx },
        ],
      });
      expect(mocks.orderBy).toHaveBeenCalledWith({ type: 'desc', column: unstakes.id });
      expect(mocks.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('getAfterBlock', () => {
    test('should get unstakes after specified block', async () => {
      const blockNumber = 1000;
      const mockUnstakes = [
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

      mocks.limit.mockResolvedValue(mockUnstakes);

      const result = await unstake.getAfterBlock(blockNumber);

      expect(result).toEqual(mockUnstakes);
      expect(sql.select).toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalledWith(unstakes);
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'or',
        conditions: [
          {
            type: 'and',
            conditions: [
              { type: 'isNull', column: unstakes.block },
              { type: 'gte', column: unstakes.timestamp, value: expect.any(Date) },
            ],
          },
          { type: 'gte', column: unstakes.block, value: blockNumber },
        ],
      });
      expect(mocks.orderBy).toHaveBeenCalledWith({ type: 'desc', column: unstakes.id });
      expect(mocks.limit).toHaveBeenCalledWith(100);
    });
  });

  describe('getWithdrawAfterBlockForAddress', () => {
    test('should get withdrawals after specified block', async () => {
      const blockNumber = 1000;
      const mockWithdraws = [
        {
          id: 1,
          address: 'test-address',
          txid: 'test-txid',
          amount: '1000',
          sAmount: '5000',
          timestamp: new Date(),
          claimTx: 'claim-txid',
          claimTxBlock: 1001,
        },
      ];

      mocks.limit.mockResolvedValue(mockWithdraws);

      const result = await unstake.getWithdrawAfterBlockForAddress(blockNumber, 'test-address');

      expect(result).toEqual(mockWithdraws);
      expect(sql.select).toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalledWith(unstakes);
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', column: unstakes.address, value: 'test-address' },
          { type: 'isNotNull', column: unstakes.claimTx },
          {
            type: 'or',
            conditions: [
              { type: 'isNull', column: unstakes.claimTxBlock },
              { type: 'gte', column: unstakes.claimTxBlock, value: blockNumber },
            ],
          },
        ],
      });
      expect(mocks.orderBy).toHaveBeenCalledWith({ type: 'desc', column: unstakes.id });
      expect(mocks.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('getWithdrawAfterBlock', () => {
    test('bounds the monitor query and excludes stale unconfirmed claims', async () => {
      const blockNumber = 1000;

      await unstake.getWithdrawAfterBlock(blockNumber);

      expect(mocks.where).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'isNotNull', column: unstakes.claimTx },
          {
            type: 'or',
            conditions: [
              {
                type: 'and',
                conditions: [
                  { type: 'isNull', column: unstakes.claimTxBlock },
                  { type: 'gte', column: unstakes.timestamp, value: expect.any(Date) },
                ],
              },
              { type: 'gte', column: unstakes.claimTxBlock, value: blockNumber },
            ],
          },
        ],
      });
      expect(mocks.orderBy).toHaveBeenCalledWith({ type: 'desc', column: unstakes.id });
      expect(mocks.limit).toHaveBeenCalledWith(100);
    });
  });

  describe('getByTxid', () => {
    test('should get unstake by txid', async () => {
      const txid = 'test-txid';
      const mockUnstake = {
        id: 1,
        address: 'test-address',
        txid,
        amount: '1000',
        sAmount: '5000',
        timestamp: new Date(),
      };

      mocks.where.mockReturnValue({ limit: mocks.limit });
      mocks.limit.mockResolvedValue([mockUnstake]);

      const result = await unstake.getByTxid(txid);

      expect(result).toEqual(mockUnstake);
      expect(sql.select).toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalledWith(unstakes);
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'eq',
        column: unstakes.txid,
        value: txid,
      });
      expect(mocks.limit).toHaveBeenCalledWith(1);
    });

    test('should return undefined when no unstake found', async () => {
      const txid = 'non-existent-txid';

      mocks.where.mockReturnValue({ limit: mocks.limit });
      mocks.limit.mockResolvedValue([]);

      const result = await unstake.getByTxid(txid);

      expect(result).toBeUndefined();
    });
  });

  describe('update', () => {
    test('should update unstake records', async () => {
      const ids = [1, 2];
      const updateData = {
        block: 1000,
      };

      await unstake.update(ids, updateData);

      expect(sql.update).toHaveBeenCalledWith(unstakes);
      expect(mocks.set).toHaveBeenCalledWith(updateData);
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'inArray',
        column: unstakes.id,
        values: ids,
      });
    });
  });
});
