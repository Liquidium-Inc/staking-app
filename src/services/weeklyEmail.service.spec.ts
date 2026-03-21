import Big from 'big.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config as publicConfig } from '@/config/public';

import { runWeeklyEmailCron } from './weeklyEmail.service';

const mocks = vi.hoisted(() => ({
  db: {
    emailSubscription: {
      deleteExpiredTokens: vi.fn(),
      getActiveVerifiedUsers: vi.fn(),
    },
    poolBalance: {
      getHistoric: vi.fn(),
    },
  },
  canister: {
    getExchangeRateDecimal: vi.fn(),
  },
  emailService: {
    generateWeeklyReportEmail: vi.fn(),
    sendEmail: vi.fn(),
  },
  runeProvider: {
    runes: {
      walletBalances: vi.fn(),
      walletActivity: vi.fn(),
    },
  },
  runePrice: {
    resolveRunePriceUsd: vi.fn(),
  },
}));

vi.mock('@/db', () => ({ db: mocks.db }));
vi.mock('@/providers/canister', () => ({ canister: mocks.canister }));
vi.mock('@/providers/email', () => ({ emailService: mocks.emailService }));
vi.mock('@/providers/rune-provider', () => ({ runeProvider: mocks.runeProvider }));
vi.mock('@/services/rune-price', () => ({
  resolveRunePriceUsd: mocks.runePrice.resolveRunePriceUsd,
}));

describe('runWeeklyEmailCron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00.000Z'));

    mocks.db.emailSubscription.deleteExpiredTokens.mockResolvedValue(undefined);
    mocks.db.emailSubscription.getActiveVerifiedUsers.mockResolvedValue([
      { address: 'bc1qtestaddress', email: 'user@example.com' },
    ]);
    mocks.db.poolBalance.getHistoric.mockResolvedValue([]);
    mocks.canister.getExchangeRateDecimal.mockResolvedValue(1.25);
    mocks.runePrice.resolveRunePriceUsd.mockResolvedValue(0.5);
    mocks.runeProvider.runes.walletBalances.mockResolvedValue({
      data: [{ rune_id: publicConfig.sRune.id, total_balance: '100' }],
      block_height: 100,
    });
    mocks.runeProvider.runes.walletActivity.mockResolvedValue({
      data: [],
      block_height: 0,
    });
    mocks.emailService.generateWeeklyReportEmail.mockResolvedValue({
      subject: 'Weekly report',
      html: '<p>weekly report</p>',
      text: 'weekly report',
    });
    mocks.emailService.sendEmail.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the shared rune price resolver when sending weekly emails', async () => {
    const promise = runWeeklyEmailCron();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mocks.db.poolBalance.getHistoric).toHaveBeenCalledOnce();
    expect(mocks.runePrice.resolveRunePriceUsd).toHaveBeenCalledOnce();
    expect(mocks.runePrice.resolveRunePriceUsd).toHaveBeenCalledWith({
      runeName: publicConfig.rune.name,
    });
    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'bc1qtestaddress',
        rune_id: publicConfig.sRune.id,
        count: 1000,
        newerThan: expect.any(Date),
      }),
    );
    expect(mocks.emailService.generateWeeklyReportEmail).toHaveBeenCalledOnce();
    expect(mocks.emailService.sendEmail).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      success: true,
      totalUsers: 1,
      emailsSent: 1,
      emailsSkipped: 0,
    });
  });

  it('keeps weekly earnings as Big values until the final cron result boundary', async () => {
    const supply = BigInt(publicConfig.sRune.supply);
    const sharedStaked = (supply - 10n).toString();

    mocks.db.emailSubscription.getActiveVerifiedUsers.mockResolvedValue([
      { address: 'bc1quserone', email: 'one@example.com' },
      { address: 'bc1qusertwo', email: 'two@example.com' },
    ]);
    mocks.db.poolBalance.getHistoric.mockResolvedValue([
      {
        timestamp: new Date('2026-03-14T12:00:00.000Z'),
        block: 1,
        balance: '10',
        staked: sharedStaked,
      },
      {
        timestamp: new Date('2026-03-20T12:00:00.000Z'),
        block: 2,
        balance: '15',
        staked: sharedStaked,
      },
    ]);
    mocks.runeProvider.runes.walletBalances.mockImplementation(async ({ address }) => ({
      data: [
        {
          rune_id: publicConfig.sRune.id,
          total_balance: address === 'bc1quserone' ? '1000' : '2000',
        },
      ],
      block_height: 100,
    }));
    mocks.runeProvider.runes.walletActivity.mockImplementation(async ({ address }) => ({
      data:
        address === 'bc1quserone'
          ? [
              {
                timestamp: '2026-03-14T12:00:00.000Z',
                rune_id: publicConfig.sRune.id,
                amount: '3',
                decimals: 1,
                event_type: 'output',
              },
            ]
          : [
              {
                timestamp: '2026-03-15T12:00:00.000Z',
                rune_id: publicConfig.sRune.id,
                amount: '12',
                decimals: 2,
                event_type: 'output',
              },
            ],
      block_height: 0,
    }));

    const promise = runWeeklyEmailCron();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mocks.emailService.generateWeeklyReportEmail).toHaveBeenCalledTimes(2);

    const firstCall = mocks.emailService.generateWeeklyReportEmail.mock.calls[0]?.[0];
    const secondCall = mocks.emailService.generateWeeklyReportEmail.mock.calls[1]?.[0];

    expect(firstCall?.earnedLiq).toBeInstanceOf(Big);
    expect(firstCall?.totalRewardsDistributed).toBeInstanceOf(Big);
    expect(firstCall?.earnedLiq.toString()).toBe('0.15');
    expect(secondCall?.earnedLiq.toString()).toBe('0.06');
    expect(firstCall?.totalRewardsDistributed.toString()).toBe('0.21');
    expect(secondCall?.totalRewardsDistributed.toString()).toBe('0.21');
    expect(result.totalRewardsDistributed).toBe(0.21);
  });
});
