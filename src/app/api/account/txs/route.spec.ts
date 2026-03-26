import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/config/public';

import { GET } from './route';

const mock = vi.hoisted(() => ({
  getPortfolioActivity: vi.fn(),
}));

vi.mock('@/services/portfolioActivity.service', () => ({
  getPortfolioActivity: mock.getPortfolioActivity,
}));

describe('GET', () => {
  const validAddress =
    config.network === 'testnet4'
      ? 'tb1qxgmgsyq62pgsz7xclvpnv2lal00l8pz220uw2z'
      : 'bc1pkkfwul773ujrlr5f5wq6auzxpw4uals4anj4z95k0nf0qx7s5vpq4nrtw7';

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
    expect(json).toEqual({ error: 'Invalid address' });
    expect(mock.getPortfolioActivity).not.toHaveBeenCalled();
  });

  it('returns 400 if address is malformed', async () => {
    const response = await GET(mockRequest('not-an-address'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid address' });
    expect(mock.getPortfolioActivity).not.toHaveBeenCalled();
  });

  it('returns the validated portfolio activity response', async () => {
    mock.getPortfolioActivity.mockResolvedValue({
      activity: [
        {
          rune_id: config.sRune.id,
          event_type: 'output',
          outpoint: 'outpoint:0',
          amount: '10',
          timestamp: '2026-01-01T00:00:00.000Z',
          decimals: 0,
        },
      ],
      truncated: false,
      originalFetchCount: 1,
      deduplicatedCount: 1,
    });

    const response = await GET(mockRequest(validAddress));
    const json = await response.json();

    expect(response).toBeInstanceOf(NextResponse);
    expect(json).toEqual({
      activity: [
        {
          rune_id: config.sRune.id,
          event_type: 'output',
          outpoint: 'outpoint:0',
          amount: '10',
          timestamp: '2026-01-01T00:00:00.000Z',
          decimals: 0,
        },
      ],
      truncated: false,
      originalFetchCount: 1,
      deduplicatedCount: 1,
    });
    expect(mock.getPortfolioActivity).toHaveBeenCalledWith(
      validAddress,
      config.sRune.id,
      5000,
      expect.any(Object),
    );
  });
});
