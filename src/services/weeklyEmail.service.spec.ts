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
});
