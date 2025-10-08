import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/config/public';

import { useProtocol } from './useProtocol';

vi.mock('axios');
const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useProtocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initialData by default', () => {
    const { result } = renderHook(() => useProtocol(), { wrapper });
    expect(result.current.data.exchangeRate).toBe(Number.POSITIVE_INFINITY);
    expect(result.current.data.rune.name).toBe(config.rune.name);
    expect(result.current.data.rune.symbol).toBe(config.rune.symbol);
    expect(result.current.data.btc.price).toBe(config.sRune.debug.btcPrice);
    expect(result.current.data.rune.priceSats).toBe(config.sRune.debug.price);
  });

  it('fetches protocol data and returns it', async () => {
    const mockData = {
      exchangeRate: 123,
      btc: { price: 456 },
      canisterAddress: 'abc',
      rune: { ...config.rune, priceSats: 789 },
      staked: { ...config.sRune },
      historicRates: [1, 2, 3],
      apy: { window: 1, monthly: 2, daily: 3, yearly: 4 },
    };
    mockedAxios.get = vi.fn().mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useProtocol(), { wrapper });

    await waitFor(() => {
      expect(result.current.data.exchangeRate).toBe(123);
      expect(result.current.data.btc.price).toBe(105_000);
      expect(result.current.data.canisterAddress).toBe('abc');
      expect(result.current.data.rune.priceSats).toBe(32);
      expect(result.current.data.historicRates).toEqual([1, 2, 3]);
      expect(result.current.data.apy.yearly).toBe(4);
    });
  });

  it('overwrites data if config.protocol.overwriteTokenConfig is true', async () => {
    const originalOverwrite = config.protocol.overwriteTokenConfig;
    config.protocol.overwriteTokenConfig = true;

    const mockData = {
      exchangeRate: 123,
      btc: { price: 999 },
      canisterAddress: 'abc',
      rune: { ...config.rune, priceSats: 888 },
      staked: { ...config.sRune, foo: 'bar' },
      historicRates: [],
      apy: { window: 1, monthly: 2, daily: 3, yearly: 4 },
    };
    mockedAxios.get = vi.fn().mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useProtocol(), { wrapper });

    await waitFor(() => {
      expect(result.current.data.btc.price).toBe(config.sRune.debug.btcPrice);
      expect(result.current.data.staked.symbol).toBe(config.sRune.symbol);
      expect(result.current.data.staked.decimals).toBe(config.sRune.decimals);
      expect(result.current.data.staked.name).toBe(mockData.staked.name);
      expect(result.current.data.rune.priceSats).toBe(config.sRune.debug.price);
    });

    config.protocol.overwriteTokenConfig = originalOverwrite;
  });
});
