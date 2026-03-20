import { describe, it, expect, vi, beforeEach } from 'vitest';

import { config } from '@/config/public';
import { pick } from '@/lib/pick';

import { GET } from './route';

const mocks = vi.hoisted(() => {
  return {
    db: {
      poolBalance: {
        getHistoric: vi.fn(),
      },
    },
    BIS: {
      runes: {
        ticker: vi.fn(),
        walletBalances: vi.fn(),
      },
    },
    canister: {
      getExchangeRate: vi.fn(),
      address: 'mock-canister-address',
    },
    runePrice: {
      resolveRunePriceSnapshot: vi.fn(),
    },
    redis: {
      client: {
        get: vi.fn(),
        set: vi.fn(),
      },
    },
  };
});

vi.mock('@/db', () => ({ db: mocks.db }));
vi.mock('@/providers/bestinslot', () => ({ BIS: mocks.BIS }));
vi.mock('@/providers/canister', () => ({ canister: mocks.canister }));
vi.mock('@/providers/redis', () => ({ redis: mocks.redis }));
vi.mock('@/services/rune-price', () => ({
  resolveRunePriceSnapshot: mocks.runePrice.resolveRunePriceSnapshot,
}));

describe('GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const supply = config.sRune.supply;
    const createRate = (timestamp: Date, balance: number, circulating: number) => {
      return { timestamp, balance, staked: +supply - +circulating + '' };
    };

    mocks.db.poolBalance.getHistoric.mockResolvedValue([
      createRate(new Date('2025-01-01'), 0, 0),
      createRate(new Date('2025-01-02'), 1000, 1000),
      createRate(new Date('2025-01-04'), 500_000, 500_000),
      createRate(new Date('2025-02-01'), 550_000, 500_000),
    ]);

    mocks.BIS.runes.ticker.mockImplementation(({ rune_id }) => {
      const key = rune_id === config.rune.id ? 'rune' : rune_id === config.sRune.id ? 'sRune' : '';
      const rune = key ? config[key] : undefined;
      return {
        data: {
          symbol: rune?.symbol,
          spaced_rune_name: rune?.name,
          decimals: rune?.decimals,
        },
      };
    });

    mocks.BIS.runes.walletBalances.mockResolvedValue({
      data: [
        { rune_id: config.rune.id, total_balance: '550000000' },
        { rune_id: config.sRune.id, total_balance: '500000000' },
      ],
      block_height: 100,
    });

    mocks.canister.getExchangeRate.mockResolvedValue({
      circulating: BigInt(1000),
      balance: BigInt(1000),
    });

    mocks.runePrice.resolveRunePriceSnapshot.mockResolvedValue({
      btcPriceUsd: 100_000,
      runePriceSats: 12_345_678,
    });

    mocks.redis.client.get.mockResolvedValue(null);
    mocks.redis.client.set.mockResolvedValue(undefined);
  });

  it('returns protocol data with correct structure', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('exchangeRate');
    expect(body).toHaveProperty('btc.price', 100_000);
    expect(body.rune).toMatchObject(config.rune);
    expect(body.staked).toMatchObject(pick(config.sRune, 'decimals', 'name', 'symbol'));
    expect(body).toHaveProperty('historicRates');
    expect(Array.isArray(body.historicRates)).toBe(true);
    expect(body).toHaveProperty('apy');
    expect(body.apy).toHaveProperty('window');
    expect(body.apy).toHaveProperty('yearly');
    expect(body.apy).toHaveProperty('monthly');
    expect(body.apy).toHaveProperty('daily');
  });

  it('computes APY correctly', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.apy.window).toBe(31);
    expect(body.apy.yearly).toBe(1.1 ** (365 / 31) - 1);
    expect(body.apy.monthly).toBe(1.1 ** (365 / 31 / 12) - 1);
    expect(body.apy.daily).toBe(1.1 ** (1 / 31) - 1);
  });

  it('returns the resolved rune price snapshot', async () => {
    const response = await GET();
    const body = await response.json();

    expect(mocks.runePrice.resolveRunePriceSnapshot).toHaveBeenCalledOnce();
    expect(body.btc.price).toBe(100_000);
    expect(body.rune.priceSats).toBe(12_345_678);
  });

  it('returns a zero rune price when the price service cannot resolve one', async () => {
    mocks.runePrice.resolveRunePriceSnapshot.mockResolvedValueOnce({
      btcPriceUsd: 100_000,
      runePriceSats: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(body.rune.priceSats).toBe(0);
  });

  it('returns protocol data even when historic pool balances fail', async () => {
    mocks.db.poolBalance.getHistoric.mockRejectedValueOnce(new Error('db offline'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.historicRates).toEqual([]);
    expect(body.apy).toEqual({
      window: 0,
      monthly: 0,
      daily: 0,
      yearly: 0,
    });
    expect(body.rune.priceSats).toBe(12_345_678);
  });

  it('throws when the exchange rate cannot be loaded', async () => {
    mocks.canister.getExchangeRate.mockRejectedValueOnce(new Error('canister offline'));

    await expect(GET()).rejects.toThrow('canister offline');
  });

  it.skip('returns exchangeRate as 1 if circulating is 0', async () => {});
});
