import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { useBalance } from './useBalance';

vi.mock('axios');
const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };

describe('useBalance', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('stays idle if address or tokenId is missing', () => {
    const { result } = renderHook(() => useBalance('', 'token', 8), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(mockedAxios.get).not.toHaveBeenCalled();

    const { result: result2 } = renderHook(() => useBalance('address', '', 8), { wrapper });
    expect(result2.current.fetchStatus).toBe('idle');
    expect(result2.current.data).toBeUndefined();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  test('fetches and returns the balance correctly', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: { total_balance: '123456789' },
    });

    const { result } = renderHook(() => useBalance('address', 'token', 8), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/account/balance', {
      params: { address: 'address', tokenId: 'token' },
    });
    expect(result.current.data).toBe(1.23456789);
  });
});
