import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PSBTService } from '@/services/psbt';

import { POST } from './route';

const mock = vi.hoisted(() => {
  return {
    build: vi.fn(),
    unstake: {
      insert: vi.fn(),
      getByTxid: vi.fn(),
    },
    canister: {
      unstake: vi.fn(),
      getUnstakeUtxos: vi.fn(),
    },
    redis: {
      client: {
        exists: vi.fn(),
      },
      utxo: {
        free: vi.fn(),
      },
    },
  };
});

const requireSessionMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 1,
    address: 'addr',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    lastActiveAt: new Date(),
  }),
);

vi.mock('@/db', () => ({
  db: {
    unstake: mock.unstake,
  },
}));

vi.mock('@/providers/canister', () => ({
  canister: mock.canister,
}));

vi.mock('@/providers/redis', () => ({
  redis: mock.redis,
}));

vi.mock('@/services/psbt', async (importOriginal) => {
  const mod = await importOriginal<{ PSBTService: unknown }>();
  return {
    PSBTService: Object.assign(
      vi.fn().mockImplementation(() => ({ build: mock.build })),
      mod.PSBTService,
    ),
  };
});

vi.mock('@/server/auth/session', () => ({
  requireSession: requireSessionMock,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

describe('POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValue({
      id: 1,
      address: 'addr',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastActiveAt: new Date(),
    });
  });

  it('returns 400 if body is invalid', async () => {
    const req = {
      json: vi.fn().mockResolvedValue({}),
    } as unknown as NextRequest;

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns response from PSBTService.build on success', async () => {
    const validBody = {
      sender: { public: 'pub', address: 'addr' },
      amount: '1000',
      sAmount: '2000',
      feeRate: 1,
    };
    const req = {
      json: vi.fn().mockResolvedValue(validBody),
    } as unknown as NextRequest;

    mock.canister.getUnstakeUtxos.mockResolvedValue([]);

    const buildResult = { psbt: 'unsigned-psbt-data', toSign: [], feeRate: 1 };
    mock.build.mockResolvedValue(buildResult);

    // Create a valid PSBT for the canister response
    const validPsbt = new bitcoin.Psbt().toBase64();
    const canisterResult = { signed_psbt: validPsbt };
    mock.canister.unstake.mockResolvedValue(canisterResult);

    // Mock no existing transaction
    mock.unstake.getByTxid.mockResolvedValue(null);

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      psbt: 'unsigned-psbt-data',
      toSign: [],
      feeRate: 1,
    });
    expect(mock.unstake.insert).toHaveBeenCalledWith({
      address: 'addr',
      amount: '1000',
      sAmount: '2000',
      txid: expect.any(String),
      psbt: validPsbt,
      block: null,
    });
  });

  it('returns 400 if NotEnoughBalanceError is thrown', async () => {
    const validBody = {
      sender: { public: 'pub', address: 'addr' },
      amount: '1000',
      sAmount: '2000',
    };
    const req = { json: vi.fn().mockResolvedValue(validBody) } as unknown as NextRequest;

    mock.canister.getUnstakeUtxos.mockResolvedValue([]);
    mock.build.mockRejectedValue(new PSBTService.NotEnoughBalanceError('not enough'));

    const response = await POST(req);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'not enough' });
  });

  it('returns 400 if canister unstake fails', async () => {
    const validBody = {
      sender: { public: 'pub', address: 'addr' },
      amount: '1000',
      sAmount: '2000',
    };
    const req = { json: vi.fn().mockResolvedValue(validBody) } as unknown as NextRequest;

    mock.canister.getUnstakeUtxos.mockResolvedValue([]);

    // Create a valid PSBT for the build result
    const validPsbt = new bitcoin.Psbt().toBase64();
    const buildResult = { psbt: validPsbt, toSign: [], feeRate: 1 };
    mock.build.mockResolvedValue(buildResult);

    mock.canister.unstake.mockResolvedValue({ error: 'Canister error' });

    // Mock Redis free for UTXO unlocking
    mock.redis.utxo.free.mockResolvedValue(true);

    const response = await POST(req);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Canister error' });
  });

  it('returns 500 if NotEnoughLiquidityError is thrown', async () => {
    const validBody = {
      sender: { public: 'pub', address: 'addr' },
      amount: '1000',
      sAmount: '2000',
    };
    const req = { json: vi.fn().mockResolvedValue(validBody) } as unknown as NextRequest;

    mock.canister.getUnstakeUtxos.mockResolvedValue([]);
    mock.build.mockRejectedValue(new PSBTService.NotEnoughLiquidityError('no liquidity'));

    const response = await POST(req);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'no liquidity' });
  });

  it('returns 500 for generic errors', async () => {
    const validBody = {
      sender: { public: 'pub', address: 'addr' },
      amount: '1000',
      sAmount: '2000',
    };
    const req = { json: vi.fn().mockResolvedValue(validBody) } as unknown as NextRequest;

    mock.canister.getUnstakeUtxos.mockResolvedValue([]);
    mock.build.mockRejectedValue(new Error('generic error'));

    const response = await POST(req);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
