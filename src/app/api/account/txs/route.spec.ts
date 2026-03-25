import { NextResponse } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { config } from '@/config/public';
import { runeProvider } from '@/providers/rune-provider';

import { GET } from './route';

const mock = vi.hoisted(() => ({
  runes: { walletActivity: vi.fn() },
}));

vi.mock('@/providers/rune-provider', () => ({
  runeProvider: { runes: { walletActivity: mock.runes.walletActivity } },
}));

describe('GET', () => {
  const mockRequest = (address?: string) => {
    const url = new URL('http://localhost/api/account/txs');
    if (address) url.searchParams.set('address', address);
    return { url: url.toString() } as Request;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if address is missing', async () => {
    const response = await GET(mockRequest());
    expect(response).toBeInstanceOf(NextResponse);
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'Missing address' });
  });

  it('returns filtered and deduplicated transactions', async () => {
    const address = 'testAddress';
    const runeId = config.sRune.id;
    mock.runes.walletActivity.mockResolvedValue({
      data: [
        {
          rune_id: runeId,
          event_type: 'output',
          outpoint: '1',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        {
          rune_id: runeId,
          event_type: 'output',
          outpoint: '1',
          timestamp: '2026-01-01T00:00:00.000Z',
        }, // duplicate
        {
          rune_id: runeId,
          event_type: 'input',
          outpoint: '2',
          timestamp: '2026-01-02T00:00:00.000Z',
        },
        {
          rune_id: 'otherRune',
          event_type: 'output',
          outpoint: '3',
          timestamp: '2026-01-03T00:00:00.000Z',
        }, // should be filtered out
      ],
      block_height: 0,
    });

    const response = await GET(mockRequest(address));
    expect(response).toBeInstanceOf(NextResponse);
    const json = await response.json();
    expect(json).toEqual({
      activity: [
        {
          rune_id: runeId,
          event_type: 'output',
          outpoint: '1',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        {
          rune_id: runeId,
          event_type: 'input',
          outpoint: '2',
          timestamp: '2026-01-02T00:00:00.000Z',
        },
      ],
      truncated: false,
      originalFetchCount: 4,
      deduplicatedCount: 2,
    });
    expect(runeProvider.runes.walletActivity).toHaveBeenCalledWith({
      address,
      rune_id: runeId,
      count: 5000,
    });
  });

  it('returns truncation metadata when the original fetch exactly hits the portfolio cap', async () => {
    const address = 'testAddress';
    const runeId = config.sRune.id;

    mock.runes.walletActivity.mockResolvedValue({
      data: Array.from({ length: 5000 }, (_, index) => ({
        rune_id: runeId,
        event_type: 'output',
        outpoint: `outpoint-${index}`,
        timestamp: '2026-01-01T00:00:00.000Z',
      })),
      block_height: 0,
    });

    const response = await GET(mockRequest(address));
    const json = await response.json();

    expect(json).toMatchObject({
      truncated: true,
      originalFetchCount: 5000,
      deduplicatedCount: 5000,
    });
  });
});
