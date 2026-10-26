import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { BroadcastService } from '@/services/broadcast';

import { POST } from './route';

const mock = vi.hoisted(() => {
  return {
    broadcast: vi.fn(),
    getTxStatus: vi.fn(),
    unstake: {
      getByPrepareTxid: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      claimSignedPsbt: vi.fn(),
      expireSignedPsbt: vi.fn(),
      invalidateClaim: vi.fn(),
      markBroadcast: vi.fn(),
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
vi.mock('@/providers/mempool', () => ({
  mempool: { transactions: { getTxStatus: mock.getTxStatus } },
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

  beforeEach(() => {
    Object.values(mock.unstake).forEach((fn) => fn.mockReset());
    mock.unstake.claimSignedPsbt.mockResolvedValue(new Date());
    mock.unstake.invalidateClaim.mockResolvedValue(true);
    mock.unstake.markBroadcast.mockResolvedValue(undefined);
    mock.getTxStatus
      .mockReset()
      .mockRejectedValue(
        Object.assign(new Error('not found'), { isAxiosError: true, response: { status: 404 } }),
      );
    mock.unstake.expireSignedPsbt.mockResolvedValue(false);
    mock.unstake.update.mockResolvedValue(undefined);
  });

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
    mock.unstake.getByPrepareTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
      txid: 'temp-txid',
      prepareTxid: 'temp-txid',
      block: null,
    });

    const buildResult = { txid: 'test-txid', fee: '1000', feeRate: 5 };
    mock.broadcast.mockResolvedValue(buildResult);

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(buildResult);
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

    mock.unstake.getByPrepareTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
      txid: 'temp-txid',
      prepareTxid: 'temp-txid',
      block: null,
    });

    const response = await POST(req);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mock.broadcast).not.toHaveBeenCalled();
  });

  it('returns 401 when requireSession throws UnauthorizedError', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    requireSessionMock.mockRejectedValueOnce(new UnauthorizedErrorMock('Unauthorized'));

    mock.unstake.getByPrepareTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
      txid: 'temp-txid',
      prepareTxid: 'temp-txid',
      block: null,
    });

    const response = await POST(req);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mock.unstake.getByPrepareTxid).not.toHaveBeenCalled();
  });

  it('should forward the BroadcastService.Error', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    // Mock database entry with canister signature
    mock.unstake.getByPrepareTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
      txid: 'temp-txid',
      prepareTxid: 'temp-txid',
      block: null,
    });

    mock.broadcast.mockRejectedValue(new BroadcastService.InvalidExchangeRate());

    const response = await POST(req);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: new BroadcastService.InvalidExchangeRate().message,
    });
    expect(mock.unstake.invalidateClaim).toHaveBeenCalledWith(1, expect.any(Date));
    expect(mock.unstake.remove).not.toHaveBeenCalled();
  });

  it('returns 500 for generic errors', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    // Mock database entry with canister signature
    mock.unstake.getByPrepareTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
      txid: 'temp-txid',
      prepareTxid: 'temp-txid',
      block: null,
    });

    mock.broadcast.mockRejectedValueOnce(new Error('fail'));

    const response = await POST(req);
    expect(response.status).toBe(500);
  });

  it('returns 404 if unstake entry not found', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    // Mock no database entry found
    mock.unstake.getByPrepareTxid.mockResolvedValue(null);

    const response = await POST(req);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Unstake entry not found or missing canister signature',
    });
  });
});
