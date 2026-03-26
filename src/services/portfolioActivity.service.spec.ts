import { beforeEach, describe, expect, it } from 'vitest';

import type { RuneProvider } from '@/providers/rune-provider';

import { getPortfolioActivity } from './portfolioActivity.service';

describe('getPortfolioActivity', () => {
  const address = 'bc1pkkfwul773ujrlr5f5wq6auzxpw4uals4anj4z95k0nf0qx7s5vpq4nrtw7';
  const runeId = '1:1';
  let walletActivityResult: Awaited<ReturnType<RuneProvider['runes']['walletActivity']>>;
  let walletActivityCalls: Array<Parameters<RuneProvider['runes']['walletActivity']>[0]>;

  const runeProvider: RuneProvider = {
    runes: {
      walletBalances: async () => ({ data: [], block_height: 0 }),
      walletActivity: async (params) => {
        walletActivityCalls.push(params);
        return walletActivityResult;
      },
    },
    mempool: {
      runicUTXOs: async () => ({ data: [], block_height: null }),
      cardinalUTXOs: async () => ({ data: [], block_height: null }),
    },
  };

  beforeEach(() => {
    walletActivityCalls = [];
    walletActivityResult = {
      data: [],
      block_height: 0,
    };
  });

  it('filters, deduplicates, and validates portfolio activity', async () => {
    walletActivityResult = {
      data: [
        {
          rune_id: runeId,
          event_type: 'output',
          outpoint: '1',
          amount: '10',
          timestamp: '2026-01-01T00:00:00.000Z',
          decimals: 0,
        },
        {
          rune_id: runeId,
          event_type: 'output',
          outpoint: '1',
          amount: '10',
          timestamp: '2026-01-01T00:00:00.000Z',
          decimals: 0,
        },
        {
          rune_id: runeId,
          event_type: 'input',
          outpoint: '2',
          amount: '5',
          timestamp: '2026-01-02T00:00:00.000Z',
          decimals: 0,
        },
        {
          rune_id: 'other-rune',
          event_type: 'output',
          outpoint: '3',
          amount: '2',
          timestamp: '2026-01-03T00:00:00.000Z',
          decimals: 0,
        },
      ],
      block_height: 0,
    };

    const result = await getPortfolioActivity(address, runeId, 5000, runeProvider);

    expect(result).toEqual({
      activity: [
        {
          rune_id: runeId,
          event_type: 'output',
          outpoint: '1',
          amount: '10',
          timestamp: '2026-01-01T00:00:00.000Z',
          decimals: 0,
        },
        {
          rune_id: runeId,
          event_type: 'input',
          outpoint: '2',
          amount: '5',
          timestamp: '2026-01-02T00:00:00.000Z',
          decimals: 0,
        },
      ],
      truncated: false,
      originalFetchCount: 4,
      deduplicatedCount: 2,
    });
    expect(walletActivityCalls).toEqual([
      {
        address,
        rune_id: runeId,
        count: 5000,
      },
    ]);
  });

  it('marks exact-limit fetches as truncated', async () => {
    walletActivityResult = {
      data: Array.from({ length: 3 }, (_, index) => ({
        rune_id: runeId,
        event_type: 'output' as const,
        outpoint: `outpoint-${index}`,
        amount: '1',
        timestamp: '2026-01-01T00:00:00.000Z',
        decimals: 0,
      })),
      block_height: 0,
    };

    const result = await getPortfolioActivity(address, runeId, 3, runeProvider);

    expect(result.truncated).toBe(true);
    expect(result.originalFetchCount).toBe(3);
    expect(result.deduplicatedCount).toBe(3);
  });

  it('throws when provider activity does not match the response schema', async () => {
    walletActivityResult = {
      data: [
        {
          rune_id: runeId,
          event_type: 'output',
          outpoint: '1',
          amount: '',
          timestamp: '2026-01-01T00:00:00.000Z',
          decimals: 0,
        },
      ],
      block_height: 0,
    };

    await expect(getPortfolioActivity(address, runeId, 5000, runeProvider)).rejects.toThrow();
  });
});
