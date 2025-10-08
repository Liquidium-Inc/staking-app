import { describe, expect, test, vi } from 'vitest';

import { mempoolBalances } from './mempoolBalances';

const mocks = vi.hoisted(() => ({
  runeOutputs: vi.fn(),
}));

vi.mock('@/providers/liquidium-api', () => ({
  liquidiumApi: mocks,
}));

describe('mempoolBalances', () => {
  test('returns 400 if address is missing', async () => {
    const request = new Request('http://localhost/api/account/balance?address=');
    const response = await mempoolBalances(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Missing address');
  });

  describe('no tokenId', () => {
    test('should return all balances when no tokenId is provided', async () => {
      const request = new Request('http://localhost/api/account/balance?address=address123');
      const mockResponse = {
        data: [
          {
            wallet_addr: 'address123',
            output: 'txid1:0',
            rune_ids: ['token123', 'token456'],
            balances: ['100000000', '200000000'],
            rune_names: ['TEST1', 'TEST2'],
            spaced_rune_name: ['TEST•1', 'TEST•2'],
            decimals: [8, 8],
            confirmations: 1,
            value: 546,
          },
          {
            wallet_addr: 'address123',
            output: 'txid2:0',
            rune_ids: ['token123'],
            balances: ['1000'],
            rune_names: ['TEST1'],
            spaced_rune_name: ['TEST•1'],
            decimals: [8],
            confirmations: 1,
            value: 546,
          },
        ],
        block_height: 100,
      };
      mocks.runeOutputs.mockResolvedValue(mockResponse);
      const response = await mempoolBalances(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual([
        { rune_id: 'token123', total_balance: '100001000' },
        { rune_id: 'token456', total_balance: '200000000' },
      ]);
    });
  });

  describe('with tokenId', () => {
    test('should return 0 when the user does not have the token', async () => {
      const request = new Request(
        'http://localhost/api/account/balance?address=address123&tokenId=token123',
      );
      mocks.runeOutputs.mockResolvedValue({ data: [], block_height: 100 });
      const response = await mempoolBalances(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ rune_id: 'token123', total_balance: '0' });
    });

    test('should return the balance of the token', async () => {
      const request = new Request(
        'http://localhost/api/account/balance?address=address123&tokenId=token123',
      );
      mocks.runeOutputs.mockResolvedValue({
        data: [
          {
            wallet_addr: 'address123',
            output: 'txid1:0',
            rune_ids: ['token123', 'token456'],
            balances: ['100000000', '200000000'],
            rune_names: ['TEST1', 'TEST2'],
            spaced_rune_name: ['TEST•1', 'TEST•2'],
            decimals: [8, 8],
            confirmations: 1,
            value: 546,
          },
          {
            wallet_addr: 'address123',
            output: 'txid2:0',
            rune_ids: ['token123'],
            balances: ['1000'],
            rune_names: ['TEST1'],
            spaced_rune_name: ['TEST•1'],
            decimals: [8],
            confirmations: 1,
            value: 546,
          },
        ],
        block_height: 100,
      });
      const response = await mempoolBalances(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ rune_id: 'token123', total_balance: '100001000' });
    });
  });
});
