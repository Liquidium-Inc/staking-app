import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PSBTService } from '@/services/psbt';

import { POST } from './route';

const mock = vi.hoisted(() => {
  return {
    build: vi.fn(),
    stake: {
      insert: vi.fn(),
      getByTxid: vi.fn(),
    },
    canister: {
      stake: vi.fn(),
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

vi.mock('@/db', () => ({
  db: {
    stake: mock.stake,
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

describe('POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const buildResult = { psbt: 'unsigned-psbt-data', toSign: [], feeRate: 1 };
    mock.build.mockResolvedValue(buildResult);

    // Create a valid PSBT for the canister response
    const validPsbt = new bitcoin.Psbt().toBase64();
    const canisterResult = { signed_psbt: validPsbt };
    mock.canister.stake.mockResolvedValue(canisterResult);

    // Mock no existing transaction
    mock.stake.getByTxid.mockResolvedValue(null);

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      psbt: 'unsigned-psbt-data',
      toSign: [],
      feeRate: 1,
    });
    expect(mock.stake.insert).toHaveBeenCalledWith({
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

    mock.build.mockRejectedValue(new PSBTService.NotEnoughBalanceError('not enough'));

    const response = await POST(req);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'not enough' });
  });

  it('returns 400 if canister stake fails', async () => {
    const validBody = {
      sender: { public: 'pub', address: 'addr' },
      amount: '1000',
      sAmount: '2000',
    };
    const req = { json: vi.fn().mockResolvedValue(validBody) } as unknown as NextRequest;

    // Create a valid PSBT for the build result
    const validPsbt = new bitcoin.Psbt().toBase64();
    const buildResult = { psbt: validPsbt, toSign: [], feeRate: 1 };
    mock.build.mockResolvedValue(buildResult);

    mock.canister.stake.mockResolvedValue({ error: 'Canister error' });

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
    const req = {
      json: vi.fn().mockResolvedValue(validBody),
    } as unknown as NextRequest;

    mock.build.mockRejectedValue(new Error('fail'));

    const response = await POST(req);
    expect(response.status).toBe(500);
  });
});
