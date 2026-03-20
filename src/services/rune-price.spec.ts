import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveRunePriceSnapshot, resolveRunePriceUsd } from './rune-price';

const mocks = vi.hoisted(() => ({
  convertedSentinelSats: 12_345_678,
  mempool: {
    getPrice: vi.fn().mockResolvedValue({ USD: 100_000 }),
  },
  coingecko: {
    liquidium: {
      getPriceUsd: vi.fn().mockResolvedValue(0.05),
    },
  },
  convertUsdPriceToSats: vi.fn().mockReturnValue(12_345_678),
  ordiscan: {
    rune: {
      market: vi.fn().mockResolvedValue({
        data: { price_in_sats: 100 },
      }),
    },
  },
}));

vi.mock('@/providers/mempool', () => ({ mempool: mocks.mempool }));
vi.mock('@/providers/coingecko', () => ({
  coingecko: mocks.coingecko,
  convertUsdPriceToSats: mocks.convertUsdPriceToSats,
}));
vi.mock('@/providers/ordiscan', () => ({ ordiscan: mocks.ordiscan }));

describe('rune-price service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses CoinGecko as the primary LIQ price source for sats', async () => {
    const result = await resolveRunePriceSnapshot({
      runeName: 'LIQUIDIUM',
    });

    expect(mocks.coingecko.liquidium.getPriceUsd).toHaveBeenCalledOnce();
    expect(mocks.convertUsdPriceToSats).toHaveBeenCalledWith(0.05, 100_000);
    expect(mocks.ordiscan.rune.market).not.toHaveBeenCalled();
    expect(result).toEqual({
      btcPriceUsd: 100_000,
      runePriceSats: mocks.convertedSentinelSats,
    });
  });

  it('falls back to legacy rune price sources when CoinGecko is unavailable', async () => {
    mocks.coingecko.liquidium.getPriceUsd.mockResolvedValueOnce(null);

    const result = await resolveRunePriceSnapshot({
      runeName: 'LIQUIDIUM',
    });

    expect(mocks.ordiscan.rune.market).toHaveBeenCalledOnce();
    expect(result.runePriceSats).toBe(100);
  });

  it('returns null when CoinGecko and Ordiscan cannot provide a sats price', async () => {
    mocks.coingecko.liquidium.getPriceUsd.mockResolvedValueOnce(null);
    mocks.ordiscan.rune.market.mockResolvedValueOnce({
      data: {},
    });

    const result = await resolveRunePriceSnapshot({
      runeName: 'LIQUIDIUM',
    });

    expect(result.runePriceSats).toBeNull();
  });

  it('returns the CoinGecko USD price without requiring BTC conversion', async () => {
    const result = await resolveRunePriceUsd({
      runeName: 'LIQUIDIUM',
    });

    expect(result).toBe(0.05);
    expect(mocks.mempool.getPrice).not.toHaveBeenCalled();
  });

  it('converts the legacy sats fallback into USD when CoinGecko is unavailable', async () => {
    mocks.coingecko.liquidium.getPriceUsd.mockResolvedValueOnce(null);
    mocks.ordiscan.rune.market.mockResolvedValueOnce({
      data: { price_in_sats: 100 },
    });

    const result = await resolveRunePriceUsd({
      runeName: 'LIQUIDIUM',
    });

    expect(mocks.ordiscan.rune.market).toHaveBeenCalledOnce();
    expect(mocks.mempool.getPrice).toHaveBeenCalledOnce();
    expect(result).toBe(0.1);
  });

  it('falls back to legacy rune sources when BTC price lookup fails', async () => {
    mocks.mempool.getPrice.mockRejectedValueOnce(new Error('mempool offline'));

    const result = await resolveRunePriceSnapshot({
      runeName: 'LIQUIDIUM',
    });

    expect(result).toEqual({
      btcPriceUsd: 0,
      runePriceSats: 100,
    });
  });

  it('returns zero USD when CoinGecko and Ordiscan both fail', async () => {
    mocks.coingecko.liquidium.getPriceUsd.mockResolvedValueOnce(null);
    mocks.ordiscan.rune.market.mockResolvedValueOnce({
      data: {},
    });

    const result = await resolveRunePriceUsd({
      runeName: 'LIQUIDIUM',
    });

    expect(result).toBe(0);
  });
});
