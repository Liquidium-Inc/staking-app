import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';

import { config } from '@/config/public';

import { usePendingStakes } from './usePendingStakes';

// Mock dependencies
vi.mock('axios');
vi.mock('./useProtocol', () => ({
  useProtocol: () => ({
    data: {
      rune: { decimals: 8 },
      staked: { decimals: 8 },
    },
  }),
}));

const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const { expectedConfirmations } = config.protocol;

describe('usePendingStakes', () => {
  const address = 'tb1qexampleaddress';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should not fetch if address is empty', async () => {
    const { result } = renderHook(() => usePendingStakes(''), { wrapper });
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  test('should fetch and transform data correctly', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        entries: [
          {
            amount: '100000000',
            sAmount: '500000000',
            status: { block_height: 100 },
          },
          {
            amount: '200000000',
            sAmount: '1000000000',
            status: { block_height: 110 },
          },
        ],
        last_block: 110,
      },
    });

    const { result } = renderHook(() => usePendingStakes(address), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedAxios.get).toHaveBeenCalledWith('/api/stake/pending', {
      params: { address },
    });

    expect(result.current.data).toEqual([
      {
        amount: 2,
        sAmount: 10,
        status: { block_height: 110 },
        confirmations: 1,
        expectedConfirmations,
      },
    ]);
  });

  test('should filter out entries with enough confirmations', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        entries: [{ amount: '100000000', sAmount: '500000000', status: { block_height: 110 } }],
        last_block: 115,
      },
    });

    const { result } = renderHook(() => usePendingStakes(address), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  test('should set confirmations to 0 if no block_height', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        entries: [{ amount: '100000000', sAmount: '500000000', status: {} }],
        last_block: 120,
      },
    });

    const { result } = renderHook(() => usePendingStakes(address), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      {
        amount: 1,
        sAmount: 5,
        status: {},
        confirmations: 0,
        expectedConfirmations,
      },
    ]);
  });
});
