import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/config/public';

const mocks = vi.hoisted(() => ({
  ordiscan: {
    rune: {
      walletActivity: vi.fn(),
    },
  },
  liquidiumApi: {
    runeBalance: vi.fn(),
    runeOutputs: vi.fn(),
    paymentOutputs: vi.fn(),
  },
  bestInSlot: {
    runes: {
      holders: vi.fn(),
    },
  },
}));

vi.mock('@/providers/ordiscan', () => ({ ordiscan: mocks.ordiscan }));
vi.mock('@/providers/liquidium-api', () => ({ liquidiumApi: mocks.liquidiumApi }));
vi.mock('@/providers/bestinslot', () => ({ BIS: mocks.bestInSlot }));

import { runeProvider } from './rune-provider';

describe('runeProvider.runes.walletActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flattens Ordiscan transaction activity into wallet input/output events', async () => {
    const address = 'bc1ptest';

    mocks.ordiscan.rune.walletActivity.mockResolvedValue({
      data: [
        {
          txid: 'tx-1',
          timestamp: '2026-01-02T00:00:00.000Z',
          runestone_messages: [],
          inputs: [
            {
              address,
              output: 'spent-outpoint:0',
              rune: config.sRune.name,
              rune_amount: '100',
            },
          ],
          outputs: [
            {
              address,
              vout: 1,
              rune: config.sRune.name,
              rune_amount: '75',
            },
            {
              address: 'bc1pother',
              vout: 2,
              rune: config.sRune.name,
              rune_amount: '25',
            },
          ],
        },
      ],
    });

    const result = await runeProvider.runes.walletActivity({
      address,
      rune_id: config.sRune.id,
      count: 10,
    });

    expect(result).toEqual({
      data: [
        {
          event_type: 'input',
          outpoint: 'spent-outpoint:0',
          amount: '100',
          timestamp: '2026-01-02T00:00:00.000Z',
          rune_id: config.sRune.id,
          decimals: config.sRune.decimals,
        },
        {
          event_type: 'output',
          outpoint: 'tx-1:1',
          amount: '75',
          timestamp: '2026-01-02T00:00:00.000Z',
          rune_id: config.sRune.id,
          decimals: config.sRune.decimals,
        },
      ],
      block_height: 0,
    });

    expect(mocks.ordiscan.rune.walletActivity).toHaveBeenCalledWith(address, {
      page: 1,
      sort: 'newest',
    });
  });

  it('stops paging once activity is older than the requested cutoff', async () => {
    const address = 'bc1ptest';
    const newerThan = new Date('2026-01-10T00:00:00.000Z');

    mocks.ordiscan.rune.walletActivity.mockResolvedValue({
      data: [
        {
          txid: 'tx-old',
          timestamp: '2026-01-01T00:00:00.000Z',
          runestone_messages: [],
          inputs: [],
          outputs: [
            {
              address,
              vout: 0,
              rune: config.sRune.name,
              rune_amount: '50',
            },
          ],
        },
      ],
    });

    const result = await runeProvider.runes.walletActivity({
      address,
      rune_id: config.sRune.id,
      count: 10,
      newerThan,
    });

    expect(result).toEqual({
      data: [],
      block_height: 0,
    });
    expect(mocks.ordiscan.rune.walletActivity).toHaveBeenCalledTimes(1);
  });
});
