import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, afterEach } from 'vitest';

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
      vi.fn().mockImplementation(() => ({ broadcast: mock.broadcast })),
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
    });

    const buildResult = { txid: 'test-txid', fee: '1000', feeRate: 5 };
    mock.broadcast.mockResolvedValue(buildResult);

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(buildResult);
    expect(mock.unstake.update).toHaveBeenCalledWith([1], { txid: 'test-txid' });
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
});
