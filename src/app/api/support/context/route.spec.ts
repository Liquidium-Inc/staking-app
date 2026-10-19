import { AxiosError } from 'axios';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBudget } from '@/server/support/budget';
import { loadStakingFacts } from '@/server/support/facts';
import { issueSupportToken } from '@/server/support/token';

const API_KEY = 'support-api-key-for-tests';
const TOKEN_SECRET = 's'.repeat(32);
const ADDRESS = 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c';
const STAKE_TXID = 'a'.repeat(64);
const UNSTAKE_TXID = 'b'.repeat(64);
const PSBT = 'cHNidP8BAHECAAAAAf/secret-psbt';

const mock = vi.hoisted(() => ({
  support: {
    apiKey: undefined as string | undefined,
    tokenSecret: undefined as string | undefined,
  },
  db: {
    stake: { getRecentOf: vi.fn() },
    unstake: { getRecentOf: vi.fn() },
  },
  mempool: {
    transactions: { getTx: vi.fn(), getTxStatus: vi.fn() },
    fees: { getFeesRecommended: vi.fn() },
  },
  runeProvider: {
    runes: { walletBalances: vi.fn() },
    mempool: { cardinalUTXOs: vi.fn(), runicUTXOs: vi.fn() },
  },
  canister: { getExchangeRate: vi.fn() },
  getPortfolioActivity: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock('@/config/config', () => ({ config: { env: 'test', support: mock.support } }));
vi.mock('@/db', () => ({ db: mock.db }));
vi.mock('@/providers/mempool', () => ({ mempool: mock.mempool }));
vi.mock('@/providers/rune-provider', () => ({
  MAX_WALLET_ACTIVITY_RESULTS: 500,
  runeProvider: mock.runeProvider,
}));
vi.mock('@/providers/canister', () => ({ canister: mock.canister }));
vi.mock('@/services/portfolioActivity.service', () => ({
  getPortfolioActivity: mock.getPortfolioActivity,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: mock.loggerInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

function request(body: unknown, authorization = `Bearer ${API_KEY}`) {
  return new NextRequest('http://localhost/api/support/context', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/support/context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.support.apiKey = API_KEY;
    mock.support.tokenSecret = TOKEN_SECRET;

    // Rows deliberately include columns that must never leave the server.
    mock.db.stake.getRecentOf.mockResolvedValue([
      {
        id: 1,
        txid: STAKE_TXID,
        amount: '10000',
        sAmount: '9000',
        timestamp: new Date(),
        block: null,
        psbt: PSBT,
      },
    ]);
    mock.db.unstake.getRecentOf.mockResolvedValue([
      {
        id: 2,
        address: ADDRESS,
        txid: UNSTAKE_TXID,
        amount: '5000',
        sAmount: '4500',
        timestamp: new Date(),
        block: 100,
        claimTx: null,
        claimTxBlock: null,
        psbt: PSBT,
      },
    ]);
    mock.mempool.transactions.getTx.mockResolvedValue({
      fee: 1000,
      weight: 800,
      status: { confirmed: false },
      vin: [{ prevout: { scriptpubkey_address: 'counterparty' }, witness: ['signature'] }],
    });
    mock.mempool.transactions.getTxStatus.mockResolvedValue({
      confirmed: true,
      block_time: Math.floor(Date.now() / 1000),
      block_height: 100,
    });
    mock.mempool.fees.getFeesRecommended.mockResolvedValue({ hourFee: 3 });
    mock.runeProvider.runes.walletBalances.mockResolvedValue({ data: [], block_height: 1 });
    mock.runeProvider.mempool.cardinalUTXOs.mockResolvedValue({ data: [], block_height: 1 });
    mock.runeProvider.mempool.runicUTXOs.mockResolvedValue({ data: [], block_height: 1 });
    mock.canister.getExchangeRate.mockResolvedValue({
      circulating: BigInt(100),
      balance: BigInt(110),
    });
    mock.getPortfolioActivity.mockResolvedValue({
      activity: [],
      truncated: false,
      complete: true,
      originalFetchCount: 0,
      deduplicatedCount: 0,
    });
  });

  it('returns 404 when SUPPORT_API_KEY is unset', async () => {
    mock.support.apiKey = undefined;
    const response = await POST(request({ address: ADDRESS, verifiedBy: {} }));
    expect(response.status).toBe(404);
  });

  it('returns 401 for an invalid support token', async () => {
    const response = await POST(request({ token: 'forged.token.value' }));
    expect(response.status).toBe(401);
    expect(mock.db.stake.getRecentOf).not.toHaveBeenCalled();
  });

  it('reads only the address from a valid token', async () => {
    const { token } = issueSupportToken(ADDRESS, TOKEN_SECRET);

    const response = await POST(request({ token }));

    expect(response.status).toBe(200);
    expect(mock.db.stake.getRecentOf).toHaveBeenCalledWith(ADDRESS, expect.any(Number));
  });

  it('returns an allowlisted context for a cross-app verified address and logs verifiedBy', async () => {
    const verifiedBy = { backend: 'wtf-btc', verifiedAt: 1, tokenId: 'jti-1' };

    const response = await POST(request({ address: ADDRESS, verifiedBy }));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['hints', 'summary', 'values']);
    expect(Object.keys(body.summary).sort()).toEqual(
      [
        'address',
        'addressType',
        'balances',
        'counts',
        'exchangeRate',
        'found',
        'mixedRuneUtxoCount',
        'recentActivity',
        'stakes',
        'unavailable',
        'unstakes',
      ].sort(),
    );
    expect(Object.keys(body.summary.stakes[0]).sort()).toEqual(
      ['amount', 'confirmed', 'feeRate', 'sAmount', 'state', 'ts', 'txid'].sort(),
    );
    expect(body.summary.stakes[0]).toMatchObject({ amount: '100', feeRate: 5, state: 'pending' });
    expect(body.summary.unstakes[0]).toMatchObject({
      txid: UNSTAKE_TXID,
      state: 'confirmed',
      withdrawable: false,
    });
    expect(body.values).toEqual([expect.objectContaining({ value: ADDRESS, destination: false })]);
    expect(serialized).not.toContain(PSBT);
    expect(serialized).not.toMatch(/psbt|signature|witness|counterparty|public/i);
    expect(mock.loggerInfo).toHaveBeenCalledWith(
      'support: cross-app verified read',
      expect.objectContaining({ verifiedByBackend: 'wtf-btc', tokenId: 'jti-1' }),
    );
  });

  it('reports exact counts and lists open stakes first, capped at 20', async () => {
    const now = Date.now();
    const confirmed = Array.from({ length: 22 }, (_, index) => ({
      id: 100 - index,
      txid: `c${index}`.padEnd(64, '0'),
      amount: '100',
      sAmount: '90',
      timestamp: new Date(now - (index + 10) * 60_000),
      block: 900_000 - index,
    }));
    const pending = {
      ...confirmed[0],
      id: 5,
      txid: STAKE_TXID,
      block: null,
      timestamp: new Date(now - 30 * 86_400_000),
    };
    const abandoned = { ...confirmed[0], id: 4, txid: 'd'.repeat(64), block: null };
    mock.db.stake.getRecentOf.mockResolvedValue([...confirmed, pending, abandoned]);
    mock.mempool.transactions.getTx.mockImplementation(async ({ txid }: { txid: string }) => {
      if (txid === abandoned.txid) {
        throw new AxiosError('not found', 'ERR_BAD_REQUEST', undefined, undefined, {
          status: 404,
        } as never);
      }
      return { fee: 1000, weight: 800, status: { confirmed: false } };
    });
    mock.getPortfolioActivity.mockResolvedValue({
      activity: [],
      truncated: true,
      complete: false,
      originalFetchCount: 500,
      deduplicatedCount: 500,
    });
    const verifiedBy = { backend: 'wtf-btc', verifiedAt: 1, tokenId: 'jti-4' };

    const body = await (await POST(request({ address: ADDRESS, verifiedBy }))).json();

    expect(body.summary.counts.stakes).toEqual({
      total: 24,
      shown: 20,
      byState: { confirmed: 22, pending: 1, not_broadcast: 1 },
      totalExact: true,
      byStateExact: true,
    });
    expect(body.summary.stakes).toHaveLength(20);
    // The old pending stake comes first despite being the oldest; never-broadcast rows stay out.
    expect(body.summary.stakes[0]).toMatchObject({ txid: STAKE_TXID, state: 'pending' });
    expect(
      body.summary.stakes.slice(1).every((stake: { state: string }) => stake.state === 'confirmed'),
    ).toBe(true);
    expect(body.summary.counts.unstakes).toEqual({
      total: 1,
      shown: 1,
      byState: { confirmed: 1 },
      totalExact: true,
      byStateExact: true,
    });
    // A provider that couldn't read the whole history never yields an "exact" total.
    expect(body.summary.counts.activity).toEqual({ total: 0, shown: 0, totalExact: false });
  });

  it('returns found false for an address with no staking footprint', async () => {
    mock.db.stake.getRecentOf.mockResolvedValue([]);
    mock.db.unstake.getRecentOf.mockResolvedValue([]);
    const verifiedBy = { backend: 'fi', verifiedAt: 1, tokenId: 'jti-3' };

    const body = await (await POST(request({ address: ADDRESS, verifiedBy }))).json();

    expect(body).toEqual({ summary: { found: false }, hints: [], values: [] });
  });

  it('marks failed provider reads as unavailable without leaking error text', async () => {
    mock.runeProvider.runes.walletBalances.mockRejectedValue(new Error('internal upstream 500 x'));
    const verifiedBy = { backend: 'fi', verifiedAt: 1, tokenId: 'jti-2' };

    const response = await POST(request({ address: ADDRESS, verifiedBy }));
    const body = await response.json();

    expect(body.summary.unavailable).toEqual(['balances']);
    expect(body.summary.balances.liq).toBeNull();
    expect(JSON.stringify(body)).not.toContain('internal upstream');
  });

  it('reports a stake the chain confirmed as confirmed before our monitor records it', async () => {
    mock.mempool.transactions.getTx.mockResolvedValue({
      fee: 1000,
      weight: 800,
      status: { confirmed: true, block_time: 1_760_000_000, block_height: 900_000 },
    });
    const verifiedBy = { backend: 'wtf-btc', verifiedAt: 1, tokenId: 'jti-5' };

    const body = await (await POST(request({ address: ADDRESS, verifiedBy }))).json();

    expect(body.summary.stakes[0]).toMatchObject({ state: 'confirmed', confirmed: true });
    expect(body.summary.counts.stakes).toMatchObject({
      byState: { confirmed: 1 },
      byStateExact: true,
    });
  });

  it('stops remote reads at the request deadline and says what it could not check', async () => {
    // Every provider hangs; only the budget ends the request.
    const hang = () => new Promise<never>(() => {});
    mock.mempool.transactions.getTx.mockImplementation(hang);
    mock.mempool.transactions.getTxStatus.mockImplementation(hang);
    mock.mempool.fees.getFeesRecommended.mockImplementation(hang);
    mock.runeProvider.runes.walletBalances.mockImplementation(hang);
    mock.runeProvider.mempool.cardinalUTXOs.mockImplementation(hang);
    mock.runeProvider.mempool.runicUTXOs.mockImplementation(hang);
    mock.canister.getExchangeRate.mockImplementation(hang);
    mock.getPortfolioActivity.mockImplementation(hang);

    const startedMs = Date.now();
    const facts = await loadStakingFacts(ADDRESS, createBudget(50));

    expect(Date.now() - startedMs).toBeLessThan(1_000);
    expect(facts.totals.stakes).toMatchObject({ total: 1, totalExact: true, byStateExact: false });
    expect(facts.totals.activity).toEqual({ total: null, totalExact: false });
    expect(facts.unavailable).toEqual(
      expect.arrayContaining([
        'balances',
        'btcBalance',
        'runeUtxos',
        'exchangeRate',
        'feeRates',
        'recentActivity',
        'stakeStates',
        'unstakeChains',
      ]),
    );
    expect(facts.liqBalance).toBeNull();
  });

  it('does not start chain checks once the budget is spent', async () => {
    await loadStakingFacts(ADDRESS, createBudget(0));

    expect(mock.mempool.transactions.getTx).not.toHaveBeenCalled();
    expect(mock.mempool.transactions.getTxStatus).not.toHaveBeenCalled();
    expect(mock.getPortfolioActivity).not.toHaveBeenCalled();
  });
});
