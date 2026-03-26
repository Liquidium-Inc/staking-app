import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useWalletActivity } from './useWalletActivity';

vi.mock('axios');
const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useWalletActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays idle if address is empty', () => {
    const { result } = renderHook(() => useWalletActivity(''), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('fetches activity data for a valid address', async () => {
    const mockData = {
      activity: [{ id: 1, tx: '0295' }],
      truncated: false,
      originalFetchCount: 1,
      deduplicatedCount: 1,
    };
    mockedAxios.get = vi.fn().mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useWalletActivity('bc1p'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockedAxios.get).toHaveBeenCalledWith('/api/account/txs', {
      params: { address: 'bc1p' },
    });
    expect(result.current.data).toEqual(mockData.activity);
  });
});
