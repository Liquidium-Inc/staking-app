import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PROTOCOL_FEE_PAYER_ERROR_MESSAGE } from '@/lib/transaction-errors';
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
      address: 'bc1qksmmyx6a8p78nr7w33cxh3lefqfa39c26lytr6',
      retention: 'bc1q3avy8nvxk5yd48gxp0a84aeef0uckqp8crxx2q',
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
      vi.fn(function PSBTServiceMock() {
        return { build: mock.build };
      }),
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

  it.each([
    { description: 'omitted payer', payer: undefined },
    {
      description: 'separate user payer',
      payer: { public: 'payment-pub', address: 'payment-addr' },
    },
  ])('returns response from PSBTService.build on success with $description', async ({ payer }) => {
    const validBody = {
      sender: { public: 'pub', address: 'addr' },
      ...(payer ? { payer } : {}),
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

  it.each(['address', 'retention'] as const)(
    'rejects the protocol %s address as fee payer before building a PSBT',
    async (protocolWallet) => {
      const req = {
        json: vi.fn().mockResolvedValue({
          sender: { public: 'pub', address: 'addr' },
          payer: { public: 'pub', address: mock.canister[protocolWallet] },
          amount: '1000',
          sAmount: '2000',
        }),
      } as unknown as NextRequest;

      const response = await POST(req);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: PROTOCOL_FEE_PAYER_ERROR_MESSAGE });
      expect(mock.build).not.toHaveBeenCalled();
      expect(mock.canister.stake).not.toHaveBeenCalled();
    },
  );

  it('returns 400 if NotEnoughBalanceError is thrown', async () => {
    const validBody = {
      sender: { public: 'pub', address: 'addr' },
      amount: '1000',
      sAmount: '2000',
    };
    const req = new NextRequest('http://localhost/api/stake', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'content-type': 'application/json' },
    });

    mock.build.mockRejectedValue(new PSBTService.NotEnoughBalanceError('not enough'));

    const response = await POST(req);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'not enough' });
  });

  it('returns a classified error for mixed-Rune source UTXOs', async () => {
    const validBody = {
      sender: { public: 'pub', address: 'addr' },
      amount: '1000',
      sAmount: '2000',
    };
    const req = new NextRequest('http://localhost/api/stake', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'content-type': 'application/json' },
    });

    mock.build.mockRejectedValue(new PSBTService.MixedRuneUtxoError());

    const response = await POST(req);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        'Your Rune balance is stored together with another Rune in the same Bitcoin UTXO. Liquidium cannot use mixed-Rune UTXOs. Separate the Runes in your wallet and try again.',
      error_code: 'mixed_rune_utxo',
    });
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
