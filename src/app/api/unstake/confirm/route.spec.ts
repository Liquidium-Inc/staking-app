import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { CANISTER_SIGNATURE_MAX_AGE_MS } from '@/lib/canister-signature';
import { SIGNATURE_EXPIRED_ERROR_MESSAGE } from '@/lib/transaction-errors';
import { BroadcastService } from '@/services/broadcast';

import { POST } from './route';

const mock = vi.hoisted(() => {
  return {
    broadcast: vi.fn(),
    unstake: {
      getByTxid: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  };
});

const sessionModule = vi.hoisted(() => {
  class UnauthorizedError extends Error {}

  const requireSession = vi.fn().mockResolvedValue({
    id: 1,
    address: 'addr',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    lastActiveAt: new Date(),
  });

  return {
    module: {
      requireSession,
      UnauthorizedError,
    },
    mocks: {
      requireSession,
      UnauthorizedError,
    },
  };
});

const { requireSession: requireSessionMock, UnauthorizedError: UnauthorizedErrorMock } =
  sessionModule.mocks;

vi.mock('@/db', () => ({
  db: {
    unstake: mock.unstake,
  },
}));
vi.mock('@/services/broadcast', async (importOriginal) => {
  const mod = await importOriginal<{ BroadcastService: unknown }>();
  return {
    BroadcastService: Object.assign(
      vi.fn(function BroadcastServiceMock() {
        return { broadcast: mock.broadcast };
      }),
      mod.BroadcastService,
    ),
  };
});

vi.mock('@/server/auth/session', () => sessionModule.module);

describe('POST', () => {
  const userPsbt = new bitcoin.Psbt().toBase64();
  const canisterPsbt = new bitcoin.Psbt().toBase64();

  afterEach(() => {
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
    const req = { json: vi.fn().mockResolvedValue({}) } as unknown as NextRequest;

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns response from BroadcastService.build on success', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    // Mock database entry with canister signature
    mock.unstake.getByTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
    });

    const buildResult = { txid: 'test-txid', fee: '1000', feeRate: 5 };
    mock.broadcast.mockResolvedValue(buildResult);

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(buildResult);
    expect(mock.unstake.update).toHaveBeenCalledWith([1], { txid: 'test-txid', psbt: null });
  });

  it('returns 401 when session address does not match unstake entry', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    requireSessionMock.mockResolvedValueOnce({
      id: 2,
      address: 'different',
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastActiveAt: new Date(),
    });

    mock.unstake.getByTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
    });

    const response = await POST(req);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mock.broadcast).not.toHaveBeenCalled();
  });

  it('returns 401 when requireSession throws UnauthorizedError', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    requireSessionMock.mockRejectedValueOnce(new UnauthorizedErrorMock('Unauthorized'));

    mock.unstake.getByTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
    });

    const response = await POST(req);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mock.unstake.getByTxid).not.toHaveBeenCalled();
  });

  it('should forward the BroadcastService.Error', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    // Mock database entry with canister signature
    mock.unstake.getByTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
    });

    mock.broadcast.mockRejectedValue(new BroadcastService.InvalidExchangeRate());

    const response = await POST(req);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: new BroadcastService.InvalidExchangeRate().message,
    });
    expect(mock.unstake.remove).toHaveBeenCalledWith([1]);
  });

  it('returns 500 for generic errors', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    // Mock database entry with canister signature
    mock.unstake.getByTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
    });

    mock.broadcast.mockRejectedValueOnce(new Error('fail'));

    const response = await POST(req);
    expect(response.status).toBe(500);
  });

  it('returns 404 if unstake entry not found', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    // Mock no database entry found
    mock.unstake.getByTxid.mockResolvedValue(null);

    const response = await POST(req);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Unstake entry not found or missing canister signature',
    });
  });

  describe('canister signature deadline', () => {
    const expiredResponse = {
      error: SIGNATURE_EXPIRED_ERROR_MESSAGE,
      error_code: 'signature_expired',
    };

    it('broadcasts when the signature is just within the deadline', async () => {
      const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;
      mock.unstake.getByTxid.mockResolvedValue({
        id: 1,
        psbt: canisterPsbt,
        address: 'addr',
        timestamp: new Date(Date.now() - CANISTER_SIGNATURE_MAX_AGE_MS + 60_000),
      });
      mock.broadcast.mockResolvedValue({ txid: 'test-txid', fee: '1000', feeRate: 5 });

      const response = await POST(req);

      expect(response.status).toBe(200);
      expect(mock.broadcast).toHaveBeenCalledTimes(1);
      expect(mock.unstake.update).toHaveBeenCalledWith([1], { txid: 'test-txid', psbt: null });
      expect(mock.unstake.remove).not.toHaveBeenCalled();
    });

    it('rejects an expired signature and removes the stored PSBT', async () => {
      const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;
      mock.unstake.getByTxid.mockResolvedValue({
        id: 1,
        psbt: canisterPsbt,
        address: 'addr',
        timestamp: new Date(Date.now() - CANISTER_SIGNATURE_MAX_AGE_MS - 1000),
      });

      const response = await POST(req);

      expect(response.status).toBe(410);
      expect(await response.json()).toEqual(expiredResponse);
      expect(mock.broadcast).not.toHaveBeenCalled();
      expect(mock.unstake.remove).toHaveBeenCalledWith([1]);
      expect(mock.unstake.update).not.toHaveBeenCalled();
    });

    it('rejects an entry without a signing timestamp', async () => {
      const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;
      mock.unstake.getByTxid.mockResolvedValue({
        id: 1,
        psbt: canisterPsbt,
        address: 'addr',
        timestamp: null,
      });

      const response = await POST(req);

      expect(response.status).toBe(410);
      expect(await response.json()).toEqual(expiredResponse);
      expect(mock.broadcast).not.toHaveBeenCalled();
      expect(mock.unstake.remove).toHaveBeenCalledWith([1]);
    });

    it('does not touch an expired entry owned by another wallet', async () => {
      const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;
      mock.unstake.getByTxid.mockResolvedValue({
        id: 1,
        psbt: canisterPsbt,
        address: 'someone-else',
        timestamp: new Date(0),
      });

      const response = await POST(req);

      expect(response.status).not.toBe(410);
      expect(mock.unstake.remove).not.toHaveBeenCalled();
      expect(mock.broadcast).not.toHaveBeenCalled();
    });

    it('cannot reuse the signature after it was rejected', async () => {
      const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;
      mock.unstake.getByTxid
        .mockResolvedValueOnce({
          id: 1,
          psbt: canisterPsbt,
          address: 'addr',
          timestamp: new Date(Date.now() - CANISTER_SIGNATURE_MAX_AGE_MS - 1000),
        })
        .mockResolvedValueOnce(undefined);

      expect((await POST(req)).status).toBe(410);
      expect((await POST(req)).status).toBe(404);
      expect(mock.broadcast).not.toHaveBeenCalled();
    });
  });
});
