import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database client
vi.mock('./client', () => ({
  sql: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { sql } from './client';
import { emailSubscription, EMAIL_TOKEN_PURPOSE } from './emailSubscription.service';

// Import the mocked module

const mockSql = vi.mocked(sql);

describe('emailSubscription service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('insert', () => {
    it('should insert a new email subscription', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue({ id: 1 }),
        }),
      });
      mockSql.insert = mockInsert;

      const result = await emailSubscription.insert('test-address', 'test@example.com');
      expect(result).toBeDefined();
      expect(mockSql.insert).toHaveBeenCalled();
    });
  });

  describe('getByAddress', () => {
    it('should get subscriptions by address', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([{ id: 1, address: 'test-address', email: 'test@example.com' }]),
        }),
      });
      mockSql.select = mockSelect;

      const result = await emailSubscription.getByAddress('test-address');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(mockSql.select).toHaveBeenCalled();
    });
  });

  describe('getByEmail', () => {
    it('should get subscriptions by email', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([{ id: 1, address: 'test-address', email: 'test@example.com' }]),
        }),
      });
      mockSql.select = mockSelect;

      const result = await emailSubscription.getByEmail('test@example.com');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(mockSql.select).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('should verify an email', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ id: 1 }),
        }),
      });
      mockSql.update = mockUpdate;

      const result = await emailSubscription.verifyEmail('test@example.com');
      expect(result).toBeDefined();
      expect(mockSql.update).toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe an email', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ id: 1 }),
      });
      mockSql.delete = mockDelete;

      const result = await emailSubscription.unsubscribe('test-address');
      expect(result).toBeDefined();
      expect(mockSql.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('getActiveVerifiedUsers', () => {
    it('should get active verified users', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([{ address: 'test-address', email: 'test@example.com' }]),
        }),
      });
      mockSql.select = mockSelect;

      const result = await emailSubscription.getActiveVerifiedUsers();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(mockSql.select).toHaveBeenCalled();
    });
  });

  describe('insertVerificationToken', () => {
    it('should insert a verification token', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({ id: 1 }),
      });
      mockSql.insert = mockInsert;

      const token = 'test-token';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const result = await emailSubscription.insertVerificationToken(
        'test-address',
        'test@example.com',
        token,
        expiresAt,
        EMAIL_TOKEN_PURPOSE.VERIFY,
      );
      expect(result).toBeDefined();
      expect(mockSql.insert).toHaveBeenCalled();
    });
  });

  describe('getVerificationToken', () => {
    it('should get a verification token with purpose', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 1,
                email: 'test@example.com',
                token: 'test-token',
                purpose: EMAIL_TOKEN_PURPOSE.VERIFY,
              },
            ]),
          }),
        }),
      });
      mockSql.select = mockSelect;

      const result = await emailSubscription.getVerificationToken(
        'test-token',
        EMAIL_TOKEN_PURPOSE.VERIFY,
      );
      expect(result).toBeDefined();
      expect(result?.token).toBe('test-token');
      expect(result?.purpose).toBe(EMAIL_TOKEN_PURPOSE.VERIFY);
      expect(mockSql.select).toHaveBeenCalled();
    });

    it('should get an unsubscribe token with purpose', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 1,
                email: 'test@example.com',
                token: 'test-token',
                purpose: EMAIL_TOKEN_PURPOSE.UNSUBSCRIBE,
              },
            ]),
          }),
        }),
      });
      mockSql.select = mockSelect;

      const result = await emailSubscription.getVerificationToken(
        'test-token',
        EMAIL_TOKEN_PURPOSE.UNSUBSCRIBE,
      );
      expect(result).toBeDefined();
      expect(result?.token).toBe('test-token');
      expect(result?.purpose).toBe(EMAIL_TOKEN_PURPOSE.UNSUBSCRIBE);
      expect(mockSql.select).toHaveBeenCalled();
    });
  });

  describe('getLatestTokenForAddress', () => {
    it('should get the latest verification token for an address', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 1,
                  address: 'test-address',
                  email: 'test@example.com',
                  token: 'test-token',
                  purpose: EMAIL_TOKEN_PURPOSE.VERIFY,
                },
              ]),
            }),
          }),
        }),
      });
      mockSql.select = mockSelect;

      const result = await emailSubscription.getLatestTokenForAddress(
        'test-address',
        EMAIL_TOKEN_PURPOSE.VERIFY,
      );
      expect(result).toBeDefined();
      expect(result?.token).toBe('test-token');
      expect(result?.purpose).toBe(EMAIL_TOKEN_PURPOSE.VERIFY);
      expect(mockSql.select).toHaveBeenCalled();
    });

    it('should get the latest unsubscribe token for an address', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 1,
                  address: 'test-address',
                  email: 'test@example.com',
                  token: 'test-token',
                  purpose: EMAIL_TOKEN_PURPOSE.UNSUBSCRIBE,
                },
              ]),
            }),
          }),
        }),
      });
      mockSql.select = mockSelect;

      const result = await emailSubscription.getLatestTokenForAddress(
        'test-address',
        EMAIL_TOKEN_PURPOSE.UNSUBSCRIBE,
      );
      expect(result).toBeDefined();
      expect(result?.token).toBe('test-token');
      expect(result?.purpose).toBe(EMAIL_TOKEN_PURPOSE.UNSUBSCRIBE);
      expect(mockSql.select).toHaveBeenCalled();
    });
  });

  describe('deleteVerificationToken', () => {
    it('should delete a verification token', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ id: 1 }),
      });
      mockSql.delete = mockDelete;

      const result = await emailSubscription.deleteVerificationToken('test-token');
      expect(result).toBeDefined();
      expect(mockSql.delete).toHaveBeenCalled();
    });
  });

  describe('deleteExpiredTokens', () => {
    it('should delete expired tokens', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ id: 1 }),
      });
      mockSql.delete = mockDelete;

      const result = await emailSubscription.deleteExpiredTokens();
      expect(result).toBeDefined();
      expect(mockSql.delete).toHaveBeenCalled();
    });
  });
});
