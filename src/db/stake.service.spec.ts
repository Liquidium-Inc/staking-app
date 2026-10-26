import { describe, test, expect, beforeEach, vi } from 'vitest';

import { sql } from './client';
import { stakes } from './schema';
import { stake } from './stake.service';

const mocks = vi.hoisted(() => ({
  values: vi.fn(),
  where: vi.fn(),
  from: vi.fn(),
  set: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  drizzle: {
    and: vi.fn((...conditions) => ({ type: 'and', conditions })),
    eq: vi.fn((col, val) => ({ type: 'eq', column: col, value: val })),
    isNull: vi.fn((col) => ({ type: 'isNull', column: col })),
    isNotNull: vi.fn((col) => ({ type: 'isNotNull', column: col })),
    inArray: vi.fn((col, vals) => ({ type: 'inArray', column: col, values: vals })),
    or: vi.fn((...conditions) => ({ type: 'or', conditions })),
    gte: vi.fn((col, val) => ({ type: 'gte', column: col, value: val })),
    lt: vi.fn((col, val) => ({ type: 'lt', column: col, value: val })),
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
  lt: mocks.drizzle.lt,
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
    mocks.where.mockReturnValue({ orderBy: mocks.orderBy });
    mocks.orderBy.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([]);
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

      mocks.limit.mockResolvedValue(mockPendingStakes);

      const result = await stake.getPendingsOf(address);

      expect(result).toEqual(mockPendingStakes);
      expect(sql.select).toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalledWith(stakes);
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', column: stakes.address, value: address },
          { type: 'isNull', column: stakes.block },
          { type: 'isNull', column: stakes.invalidatedAt },
        ],
      });
      expect(mocks.orderBy).toHaveBeenCalledWith({ type: 'desc', column: stakes.id });
      expect(mocks.limit).toHaveBeenCalledWith(50);
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

      mocks.limit.mockResolvedValue(mockStakes);

      const result = await stake.getAfterBlock(blockNumber);

      expect(result).toEqual(mockStakes);
      expect(sql.select).toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalledWith(stakes);
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'or',
        conditions: [
          {
            type: 'and',
            conditions: [
              { type: 'isNull', column: stakes.block },
              { type: 'gte', column: stakes.timestamp, value: expect.any(Date) },
            ],
          },
          { type: 'gte', column: stakes.block, value: blockNumber },
        ],
      });
      expect(mocks.orderBy).toHaveBeenCalledWith({ type: 'desc', column: stakes.id });
      expect(mocks.limit).toHaveBeenCalledWith(100);
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

  describe('signed PSBT lifecycle', () => {
    const signedAfter = new Date('2026-01-01T12:00:00Z');
    const returning = (rows: unknown[]) => {
      const fn = vi.fn().mockResolvedValue(rows);
      mocks.where.mockReturnValueOnce({ returning: fn });
      return fn;
    };

    test('claimSignedPsbt clears the exact stored PSBT only while fresh and valid', async () => {
      returning([{ id: 1 }]);

      await expect(stake.claimSignedPsbt(1, 'stored-psbt', signedAfter)).resolves.toBe(true);

      expect(sql.update).toHaveBeenCalledWith(stakes);
      expect(mocks.set).toHaveBeenCalledWith({ psbt: null });
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', column: stakes.id, value: 1 },
          { type: 'eq', column: stakes.psbt, value: 'stored-psbt' },
          { type: 'isNull', column: stakes.invalidatedAt },
          { type: 'gte', column: stakes.timestamp, value: signedAfter },
        ],
      });
    });

    test('claimSignedPsbt reports when no row was claimed', async () => {
      returning([]);
      await expect(stake.claimSignedPsbt(1, 'stored-psbt', signedAfter)).resolves.toBe(false);
    });

    test('expireSignedPsbt invalidates only a still-stored, stale signature', async () => {
      returning([{ id: 1 }]);

      await expect(stake.expireSignedPsbt(1, signedAfter)).resolves.toBe(true);

      expect(mocks.set).toHaveBeenCalledWith({ psbt: null, invalidatedAt: expect.any(Date) });
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', column: stakes.id, value: 1 },
          { type: 'isNotNull', column: stakes.psbt },
          { type: 'isNull', column: stakes.invalidatedAt },
          {
            type: 'or',
            conditions: [
              { type: 'isNull', column: stakes.timestamp },
              { type: 'lt', column: stakes.timestamp, value: signedAfter },
            ],
          },
        ],
      });
    });

    test('refreshSignedPsbt only replaces invalidated or expired signatures', async () => {
      mocks.where.mockResolvedValueOnce(undefined);

      await stake.refreshSignedPsbt(1, 'fresh-psbt', signedAfter);

      expect(mocks.set).toHaveBeenCalledWith({
        psbt: 'fresh-psbt',
        timestamp: expect.any(Date),
        invalidatedAt: null,
      });
      expect(mocks.where).toHaveBeenCalledWith({
        type: 'and',
        conditions: [
          { type: 'eq', column: stakes.id, value: 1 },
          {
            type: 'or',
            conditions: [
              { type: 'isNotNull', column: stakes.invalidatedAt },
              {
                type: 'and',
                conditions: [
                  { type: 'isNotNull', column: stakes.psbt },
                  { type: 'lt', column: stakes.timestamp, value: signedAfter },
                ],
              },
            ],
          },
        ],
      });
    });
  });
});
