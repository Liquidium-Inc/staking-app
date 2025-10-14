import { describe, it, expect, vi, beforeEach } from 'vitest';

import { config } from '@/config/public';
import { pick } from '@/lib/pick';

import { GET } from './route';

const supply = config.sRune.supply;

const createRate = (timestamp: Date, balance: number, circulating: number) => {
  return { timestamp, balance, staked: +supply - +circulating + '' };
};

const mocks = vi.hoisted(() => ({
  db: {
    poolBalance: {
      getHistoric: vi
        .fn()
        .mockImplementation(() => [
          createRate(new Date('2025-01-01'), 0, 0),
          createRate(new Date('2025-01-02'), 1000, 1000),
          createRate(new Date('2025-01-04'), 500_000, 500_000),
          createRate(new Date('2025-02-01'), 550_000, 500_000),
        ]),
    },
  },
  BIS: {
    runes: {
      ticker: vi.fn().mockImplementation(({ rune_id }) => {
        const key =
          rune_id === config.rune.id ? 'rune' : rune_id === config.sRune.id ? 'sRune' : '';
        const rune = key ? config[key] : undefined;
        return {
          data: {
            symbol: rune?.symbol,
            spaced_rune_name: rune?.name,
            decimals: rune?.decimals,
          },
        };
      }),
      walletBalances: vi.fn().mockImplementation(() => ({
        data: [
          { rune_id: config.rune.id, total_balance: '550000000' },
          { rune_id: config.sRune.id, total_balance: '500000000' },
        ],
        block_height: 100,
      })),
    },
  },
  mempool: { getPrice: vi.fn().mockImplementation(() => ({ USD: 100_000 })) },
}));

vi.mock('@/db', () => ({ db: mocks.db }));
vi.mock('@/providers/bestinslot', () => ({ BIS: mocks.BIS }));
vi.mock('@/providers/mempool', () => ({ mempool: mocks.mempool }));

describe('GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it.skip('returns exchangeRate as 1 if circulating is 0', async () => {});
});
