import Big from 'big.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config as publicConfig } from '@/config/public';

import { runWeeklyEmailCron } from './weeklyEmail.service';

const RECENT_WEEKLY_ACTIVITY_COUNT = 1000;
const MAX_WEEKLY_ACTIVITY_HISTORY_COUNT = 5000;

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
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/db', () => ({ db: mocks.db }));
vi.mock('@/lib/logger', () => ({ logger: mocks.logger }));
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
        count: RECENT_WEEKLY_ACTIVITY_COUNT,
        newerThan: expect.any(Date),
      }),
    );
    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenCalledTimes(1);
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
    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenCalledTimes(2);
    expect(result.totalRewardsDistributed).toBe(0.21);
  });

  it('reconstructs weekly earnings from full history when a recent withdrawal consumes an older slot', async () => {
    const supply = BigInt(publicConfig.sRune.supply);
    const sharedStaked = (supply - 10n).toString();

    mocks.db.poolBalance.getHistoric.mockResolvedValue([
      {
        timestamp: new Date('2026-03-10T12:00:00.000Z'),
        block: 1,
        balance: '10',
        staked: sharedStaked,
      },
      {
        timestamp: new Date('2026-03-18T12:00:00.000Z'),
        block: 2,
        balance: '12',
        staked: sharedStaked,
      },
      {
        timestamp: new Date('2026-03-20T12:00:00.000Z'),
        block: 3,
        balance: '13',
        staked: sharedStaked,
      },
    ]);
    mocks.runeProvider.runes.walletBalances.mockResolvedValue({
      data: [{ rune_id: publicConfig.sRune.id, total_balance: '600' }],
      block_height: 100,
    });
    mocks.runeProvider.runes.walletActivity.mockImplementation(async ({ newerThan, count }) => ({
      data: newerThan
        ? [
            {
              timestamp: '2026-03-18T12:00:00.000Z',
              rune_id: publicConfig.sRune.id,
              amount: '4',
              decimals: 0,
              event_type: 'input',
            },
          ]
        : [
            {
              timestamp: '2026-03-18T12:00:00.000Z',
              rune_id: publicConfig.sRune.id,
              amount: '4',
              decimals: 0,
              event_type: 'input',
            },
            {
              timestamp: '2026-03-10T12:00:00.000Z',
              rune_id: publicConfig.sRune.id,
              amount: '10',
              decimals: 0,
              event_type: 'output',
            },
          ],
      block_height: count === MAX_WEEKLY_ACTIVITY_HISTORY_COUNT ? 1 : 0,
    }));

    const promise = runWeeklyEmailCron();
    await vi.runAllTimersAsync();
    const result = await promise;

    const emailCall = mocks.emailService.generateWeeklyReportEmail.mock.calls[0]?.[0];

    expect(emailCall?.earnedLiq.toString()).toBe('2.6');
    expect(emailCall?.totalRewardsDistributed.toString()).toBe('2.6');
    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        address: 'bc1qtestaddress',
        rune_id: publicConfig.sRune.id,
        count: RECENT_WEEKLY_ACTIVITY_COUNT,
        newerThan: expect.any(Date),
      }),
    );
    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenNthCalledWith(2, {
      address: 'bc1qtestaddress',
      rune_id: publicConfig.sRune.id,
      count: MAX_WEEKLY_ACTIVITY_HISTORY_COUNT,
    });
    expect(result).toMatchObject({
      emailsSent: 1,
      emailsSkipped: 0,
      totalRewardsDistributed: 2.6,
    });
  });

  it('skips weekly emails and logs clearly when FIFO reconstruction still fails', async () => {
    const supply = BigInt(publicConfig.sRune.supply);
    const sharedStaked = (supply - 10n).toString();

    mocks.db.poolBalance.getHistoric.mockResolvedValue([
      {
        timestamp: new Date('2026-03-18T12:00:00.000Z'),
        block: 2,
        balance: '12',
        staked: sharedStaked,
      },
      {
        timestamp: new Date('2026-03-20T12:00:00.000Z'),
        block: 3,
        balance: '13',
        staked: sharedStaked,
      },
    ]);
    mocks.runeProvider.runes.walletBalances.mockResolvedValue({
      data: [{ rune_id: publicConfig.sRune.id, total_balance: '600' }],
      block_height: 100,
    });
    mocks.runeProvider.runes.walletActivity.mockResolvedValue({
      data: [
        {
          timestamp: '2026-03-18T12:00:00.000Z',
          rune_id: publicConfig.sRune.id,
          amount: '4',
          decimals: 0,
          event_type: 'input',
        },
      ],
      block_height: 0,
    });

    const promise = runWeeklyEmailCron();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mocks.emailService.generateWeeklyReportEmail).not.toHaveBeenCalled();
    expect(mocks.emailService.sendEmail).not.toHaveBeenCalled();
    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        address: 'bc1qtestaddress',
        rune_id: publicConfig.sRune.id,
        count: RECENT_WEEKLY_ACTIVITY_COUNT,
        newerThan: expect.any(Date),
      }),
    );
    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenNthCalledWith(2, {
      address: 'bc1qtestaddress',
      rune_id: publicConfig.sRune.id,
      count: MAX_WEEKLY_ACTIVITY_HISTORY_COUNT,
    });
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipping weekly earnings for address bc1qtestaddress'),
      expect.any(Error),
    );
    expect(result).toMatchObject({
      emailsSent: 0,
      emailsSkipped: 1,
      totalRewardsDistributed: 0,
    });
  });
});
