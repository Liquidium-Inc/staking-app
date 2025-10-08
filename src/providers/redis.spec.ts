import RedisMock from 'ioredis-mock';
import { vi, describe, test, expect, afterEach } from 'vitest';

import { redis } from './redis';

// Mock ioredis with ioredis-mock using Vitest
vi.mock('ioredis', () => {
  return { Redis: RedisMock };
});

describe('redis', () => {
  test('should initialize Redis client', () => {
    expect(redis).toBeDefined();
  });

  afterEach(async () => {
    await redis.client?.flushall();
  });

  describe('lock', () => {
    test('should lock a UTXO', async () => {
      const result = await redis.utxo.lock('utxo1', 'user1', 30);
      expect(result).toBe(true);
    });

    test('should not lock a UTXO if already locked', async () => {
      await redis.utxo.lock('utxo1', 'user1', 30);
      const result = await redis.utxo.lock('utxo1', 'user2', 30);
      expect(result).toBe(false);
    });

    test('should able to lock a UTXO after it expired', async () => {
      await redis.utxo.lock('utxo1', 'user1', 0.05);
      await new Promise((resolve) => setTimeout(resolve, 75));
      const result = await redis.utxo.lock('utxo1', 'user2', 30);
      expect(result).toBe(true);
    });
  });

  describe('extendLock', () => {
    test('should extend lock on a UTXO', async () => {
      expect(await redis.utxo.lock('utxo1', 'user1', 30)).toBe(true);

      expect(await redis.utxo.extend(['utxo1'], 'user1', 3600)).toBe(true);

      expect(await redis.client?.ttl('utxo:utxo1')).toBeGreaterThan(30);
    });

    test('should not extend lock if UTXO is not locked by the user', async () => {
      expect(await redis.utxo.lock('utxo1', 'user1', 30)).toBe(true);

      expect(await redis.utxo.extend(['utxo1'], 'user2', 3600)).toBe(false);

      expect(await redis.client?.ttl('utxo:utxo1')).toBeLessThanOrEqual(30);
    });

    test('should not extend lock if UTXO is not locked', async () => {
      expect(await redis.utxo.extend(['utxo1'], 'user4', 3600)).toBe(false);
    });

    test('should extend lock on multiple UTXOs', async () => {
      expect(await redis.utxo.lock('utxo1', 'user1', 30)).toBe(true);
      expect(await redis.utxo.lock('utxo2', 'user1', 30)).toBe(true);

      expect(await redis.utxo.extend(['utxo1', 'utxo2'], 'user1', 3600)).toBe(true);

      expect(await redis.client?.ttl('utxo:utxo1')).toBeGreaterThan(30);
      expect(await redis.client?.ttl('utxo:utxo2')).toBeGreaterThan(30);
    });
  });

  describe('free', () => {
    test('should free a locked UTXO', async () => {
      expect(await redis.utxo.lock('utxo1', 'user1', 30)).toBe(true);
      expect(await redis.utxo.free(['utxo1'], 'user1')).toBe(true);
      expect(await redis.client?.exists('utxo:utxo1')).toBe(0);
    });

    test('should not free a UTXO if not locked by the user', async () => {
      expect(await redis.utxo.lock('utxo1', 'user1', 30)).toBe(true);
      expect(await redis.utxo.free(['utxo1'], 'user2')).toBe(false);
      expect(await redis.client?.exists('utxo:utxo1')).toBe(1);
    });

    test('should not free a UTXO if not locked', async () => {
      expect(await redis.utxo.free(['utxo1'], 'user1')).toBe(false);
      expect(await redis.client?.exists('utxo:utxo1')).toBe(0);
    });

    test('should free multiple UTXOs', async () => {
      expect(await redis.utxo.lock('utxo1', 'user1', 30)).toBe(true);
      expect(await redis.utxo.lock('utxo2', 'user1', 30)).toBe(true);
      expect(await redis.utxo.free(['utxo1', 'utxo2'], 'user1')).toBe(true);
      expect(await redis.client?.exists('utxo:utxo1')).toBe(0);
      expect(await redis.client?.exists('utxo:utxo2')).toBe(0);
    });

    test('should not free if some UTXOs do not match the user', async () => {
      expect(await redis.utxo.lock('utxo1', 'user1', 30)).toBe(true);
      expect(await redis.utxo.lock('utxo2', 'user2', 30)).toBe(true);
      expect(await redis.utxo.free(['utxo1', 'utxo2'], 'user1')).toBe(false);
      expect(await redis.client?.exists('utxo:utxo1')).toBe(1);
      expect(await redis.client?.exists('utxo:utxo2')).toBe(1);
    });
  });
});
