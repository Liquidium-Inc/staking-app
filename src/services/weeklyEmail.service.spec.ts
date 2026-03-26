import Big from 'big.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config as publicConfig } from '@/config/public';

import {
  MAX_WEEKLY_ACTIVITY_HISTORY_COUNT,
  RECENT_WEEKLY_ACTIVITY_COUNT,
  runWeeklyEmailCron,
  WEEKLY_EARNINGS_CONCURRENCY,
} from './weeklyEmail.service';

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks(iterations = 10) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

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
    mocks.runeProvider.runes.walletActivity.mockResolvedValue({
      data: [
        {
          timestamp: '2026-03-19T12:00:00.000Z',
          rune_id: publicConfig.sRune.id,
          amount: '100',
          decimals: 0,
          event_type: 'output',
        },
      ],
      block_height: 0,
    });

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
          total_balance: address === 'bc1quserone' ? '3' : '12',
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

  it('falls back to bounded history when the recent slice does not explain the current balance', async () => {
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
        timestamp: new Date('2026-03-20T12:00:00.000Z'),
        block: 2,
        balance: '13',
        staked: sharedStaked,
      },
    ]);
    mocks.runeProvider.runes.walletBalances.mockResolvedValue({
      data: [{ rune_id: publicConfig.sRune.id, total_balance: '10' }],
      block_height: 100,
    });
    mocks.runeProvider.runes.walletActivity.mockImplementation(async ({ newerThan }) => ({
      data: newerThan
        ? [
            {
              timestamp: '2026-03-18T12:00:00.000Z',
              rune_id: publicConfig.sRune.id,
              amount: '4',
              decimals: 0,
              event_type: 'output',
            },
          ]
        : [
            {
              timestamp: '2026-03-18T12:00:00.000Z',
              rune_id: publicConfig.sRune.id,
              amount: '4',
              decimals: 0,
              event_type: 'output',
            },
            {
              timestamp: '2026-03-10T12:00:00.000Z',
              rune_id: publicConfig.sRune.id,
              amount: '6',
              decimals: 0,
              event_type: 'output',
            },
          ],
      block_height: 0,
    }));

    const promise = runWeeklyEmailCron();
    await vi.runAllTimersAsync();
    const result = await promise;

    const emailCall = mocks.emailService.generateWeeklyReportEmail.mock.calls[0]?.[0];

    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenCalledTimes(2);
    expect(emailCall?.earnedLiq.toString()).toBe('3');
    expect(result).toMatchObject({
      emailsSent: 1,
      emailsSkipped: 0,
      totalRewardsDistributed: 3,
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

  it('falls back to bounded history when the recent activity page exactly fills its limit', async () => {
    const supply = BigInt(publicConfig.sRune.supply);
    const sharedStaked = (supply - 10n).toString();
    const fullRecentActivity = Array.from({ length: RECENT_WEEKLY_ACTIVITY_COUNT }, () => ({
      timestamp: '2026-03-18T12:00:00.000Z',
      rune_id: publicConfig.sRune.id,
      amount: '1',
      decimals: 0,
      event_type: 'input',
    }));

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
    mocks.runeProvider.runes.walletActivity.mockImplementation(async ({ newerThan }) => ({
      data: newerThan
        ? fullRecentActivity
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
      block_height: 0,
    }));

    const promise = runWeeklyEmailCron();
    await vi.runAllTimersAsync();
    const result = await promise;

    const emailCall = mocks.emailService.generateWeeklyReportEmail.mock.calls[0]?.[0];

    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenCalledTimes(2);
    expect(emailCall?.earnedLiq.toString()).toBe('2.6');
    expect(result).toMatchObject({
      emailsSent: 1,
      emailsSkipped: 0,
      totalRewardsDistributed: 2.6,
    });
  });

  it('skips weekly earnings when an exact-limit bounded history still cannot reconstruct balance', async () => {
    const fullRecentActivity = Array.from({ length: RECENT_WEEKLY_ACTIVITY_COUNT }, () => ({
      timestamp: '2026-03-18T12:00:00.000Z',
      rune_id: publicConfig.sRune.id,
      amount: '1',
      decimals: 0,
      event_type: 'input',
    }));
    const fullBoundedHistoryActivity = Array.from(
      { length: MAX_WEEKLY_ACTIVITY_HISTORY_COUNT },
      () => ({
        timestamp: '2026-03-10T12:00:00.000Z',
        rune_id: publicConfig.sRune.id,
        amount: '1',
        decimals: 0,
        event_type: 'input',
      }),
    );

    mocks.runeProvider.runes.walletActivity.mockImplementation(async ({ newerThan }) => ({
      data: newerThan ? fullRecentActivity : fullBoundedHistoryActivity,
      block_height: 0,
    }));

    const promise = runWeeklyEmailCron();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mocks.emailService.generateWeeklyReportEmail).not.toHaveBeenCalled();
    expect(mocks.emailService.sendEmail).not.toHaveBeenCalled();
    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenCalledTimes(2);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipping weekly earnings for address bc1qtestaddress'),
      expect.objectContaining({
        message: expect.stringContaining('wallet activity hit the bounded weekly history limit'),
      }),
    );
    expect(result).toMatchObject({
      emailsSent: 0,
      emailsSkipped: 1,
      totalRewardsDistributed: 0,
    });
  });

  it('does not skip weekly earnings when an exact-limit bounded history fully reconstructs the wallet', async () => {
    const supply = BigInt(publicConfig.sRune.supply);
    const sharedStaked = (supply - 5000n).toString();
    const fullRecentActivity = Array.from({ length: RECENT_WEEKLY_ACTIVITY_COUNT }, () => ({
      timestamp: '2026-03-18T12:00:00.000Z',
      rune_id: publicConfig.sRune.id,
      amount: '1',
      decimals: 0,
      event_type: 'output',
    }));
    const fullBoundedHistoryActivity = Array.from(
      { length: MAX_WEEKLY_ACTIVITY_HISTORY_COUNT },
      (_, index) => ({
        timestamp: `2026-03-${String((index % 10) + 10).padStart(2, '0')}T12:00:00.000Z`,
        rune_id: publicConfig.sRune.id,
        amount: '1',
        decimals: 0,
        event_type: 'output',
      }),
    );

    mocks.db.poolBalance.getHistoric.mockResolvedValue([
      {
        timestamp: new Date('2026-03-14T12:00:00.000Z'),
        block: 1,
        balance: '5000',
        staked: sharedStaked,
      },
      {
        timestamp: new Date('2026-03-20T12:00:00.000Z'),
        block: 2,
        balance: '6500',
        staked: sharedStaked,
      },
    ]);
    mocks.runeProvider.runes.walletBalances.mockResolvedValue({
      data: [{ rune_id: publicConfig.sRune.id, total_balance: '5000' }],
      block_height: 100,
    });
    mocks.runeProvider.runes.walletActivity.mockImplementation(async ({ newerThan }) => ({
      data: newerThan ? fullRecentActivity : fullBoundedHistoryActivity,
      block_height: 0,
    }));

    const promise = runWeeklyEmailCron();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mocks.emailService.generateWeeklyReportEmail).toHaveBeenCalledOnce();
    expect(mocks.emailService.sendEmail).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      emailsSent: 1,
      emailsSkipped: 0,
    });
  });

  it('retries weekly earnings during send when the totals pass hit a transient fetch error', async () => {
    const supply = BigInt(publicConfig.sRune.supply);
    const sharedStaked = (supply - 10n).toString();
    const transientError = new Error('ordiscan temporarily unavailable');

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
    mocks.runeProvider.runes.walletBalances.mockResolvedValue({
      data: [{ rune_id: publicConfig.sRune.id, total_balance: '3' }],
      block_height: 100,
    });
    mocks.runeProvider.runes.walletActivity
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue({
        data: [
          {
            timestamp: '2026-03-14T12:00:00.000Z',
            rune_id: publicConfig.sRune.id,
            amount: '3',
            decimals: 1,
            event_type: 'output',
          },
        ],
        block_height: 0,
      });

    const promise = runWeeklyEmailCron();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenCalledTimes(2);
    expect(mocks.emailService.generateWeeklyReportEmail).toHaveBeenCalledOnce();
    expect(mocks.emailService.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to calculate weekly earnings for address bc1qtestaddress:',
      transientError,
    );
    expect(result).toMatchObject({
      emailsSent: 1,
      emailsSkipped: 0,
      totalRewardsDistributed: 0,
    });
  });

  it('limits total rewards reconstruction to bounded concurrency', async () => {
    const users = Array.from({ length: WEEKLY_EARNINGS_CONCURRENCY + 1 }, (_, index) => ({
      address: `bc1qconcurrency${index}`,
      email: `user${index}@example.com`,
    }));
    const pendingByAddress = new Map(
      users.map((user) => [
        user.address,
        createDeferred<{
          data: Array<{
            timestamp: string;
            rune_id: string;
            amount: string;
            decimals: number;
            event_type: 'output';
          }>;
          block_height: number;
        }>(),
      ]),
    );

    mocks.db.emailSubscription.getActiveVerifiedUsers.mockResolvedValue(users);
    mocks.runeProvider.runes.walletBalances.mockResolvedValue({
      data: [{ rune_id: publicConfig.sRune.id, total_balance: '3' }],
      block_height: 100,
    });
    mocks.runeProvider.runes.walletActivity.mockImplementation(async ({ address }) => {
      const deferred = pendingByAddress.get(address);
      if (!deferred) {
        throw new Error(`Missing deferred activity for ${address}`);
      }

      return deferred.promise;
    });

    const promise = runWeeklyEmailCron();
    await flushMicrotasks();

    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenCalledTimes(
      WEEKLY_EARNINGS_CONCURRENCY,
    );

    pendingByAddress.get(users[0]!.address)?.resolve({
      data: [
        {
          timestamp: '2026-03-14T12:00:00.000Z',
          rune_id: publicConfig.sRune.id,
          amount: '3',
          decimals: 1,
          event_type: 'output',
        },
      ],
      block_height: 0,
    });

    await flushMicrotasks();

    expect(mocks.runeProvider.runes.walletActivity).toHaveBeenCalledTimes(
      WEEKLY_EARNINGS_CONCURRENCY + 1,
    );

    for (const user of users.slice(1)) {
      pendingByAddress.get(user.address)?.resolve({
        data: [
          {
            timestamp: '2026-03-14T12:00:00.000Z',
            rune_id: publicConfig.sRune.id,
            amount: '3',
            decimals: 1,
            event_type: 'output',
          },
        ],
        block_height: 0,
      });
    }

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({
      emailsSent: WEEKLY_EARNINGS_CONCURRENCY + 1,
      emailsSkipped: 0,
    });
  });

  it('aborts the weekly job when db.poolBalance.getHistoric fails', async () => {
    const historicError = new Error('historic fetch failed');
    mocks.db.poolBalance.getHistoric.mockRejectedValue(historicError);

    await expect(runWeeklyEmailCron()).rejects.toThrow('historic fetch failed');
    expect(mocks.logger.error).toHaveBeenCalledWith(
      'db.poolBalance.getHistoric failed for weekly email:',
      historicError,
    );
    expect(mocks.emailService.generateWeeklyReportEmail).not.toHaveBeenCalled();
    expect(mocks.emailService.sendEmail).not.toHaveBeenCalled();
  });
});
