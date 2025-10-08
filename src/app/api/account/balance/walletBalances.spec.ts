import { describe, expect, test, vi } from 'vitest';

import { walletBalances } from './walletBalances';

const mocks = vi.hoisted(() => ({
  runeBalance: vi.fn(),
}));

vi.mock('@/providers/liquidium-api', () => ({
  liquidiumApi: mocks,
}));

describe('walletBalances', () => {
  test('returns 400 if address is missing', async () => {
    const request = new Request('http://localhost/api/account/balance?address=');
    const response = await walletBalances(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Missing address');
  });

  describe('no tokenId', () => {
    test('should return all balances when no tokenId is provided', async () => {
      const request = new Request('http://localhost/api/account/balance?address=address123');
      const mockBalance = [
        { rune_id: 'token123', total_balance: '100000000' },
        { rune_id: 'token456', total_balance: '200000000' },
      ];
      mocks.runeBalance.mockResolvedValue({ data: mockBalance, block_height: 100 });
      const response = await walletBalances(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual(mockBalance);
    });
  });

  describe('with tokenId', () => {
    test('should return 0 when the user does not have the token', async () => {
      const request = new Request(
        'http://localhost/api/account/balance?address=address123&tokenId=token123',
      );
      mocks.runeBalance.mockResolvedValue({ data: [], block_height: 100 });
      const response = await walletBalances(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ rune_id: 'token123', total_balance: '0' });
    });

    test('should return the balance of the token', async () => {
      const request = new Request(
        'http://localhost/api/account/balance?address=address123&tokenId=token123',
      );
      mocks.runeBalance.mockResolvedValue({
        data: [
          { rune_id: 'token123', total_balance: '100000000' },
          { rune_id: 'token456', total_balance: '200000000' },
        ],
        block_height: 100,
      });
      const response = await walletBalances(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ rune_id: 'token123', total_balance: '100000000' });
    });
  });
});
