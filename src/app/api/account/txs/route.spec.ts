import { NextResponse } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { config } from '@/config/public';
import { BIS } from '@/providers/bestinslot';

import { GET } from './route';

const mock = vi.hoisted(() => ({
  runes: { walletActivity: vi.fn() },
}));

vi.mock('@/providers/bestinslot', () => ({
  BIS: mock,
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
        { rune_id: runeId, event_type: 'mint', outpoint: '1' },
        { rune_id: runeId, event_type: 'mint', outpoint: '1' }, // duplicate
        { rune_id: runeId, event_type: 'transfer', outpoint: '2' },
        { rune_id: 'otherRune', event_type: 'mint', outpoint: '3' }, // should be filtered out
      ],
    });

    const response = await GET(mockRequest(address));
    expect(response).toBeInstanceOf(NextResponse);
    const json = await response.json();
    expect(json).toEqual([
      { rune_id: runeId, event_type: 'mint', outpoint: '1' },
      { rune_id: runeId, event_type: 'transfer', outpoint: '2' },
    ]);
    expect(BIS.runes.walletActivity).toHaveBeenCalledWith({
      address,
      rune_id: runeId,
      count: 2000,
    });
  });
});
