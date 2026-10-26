import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { CANISTER_SIGNATURE_MAX_AGE_MS } from '@/lib/canister-signature';
import { SIGNATURE_EXPIRED_ERROR_MESSAGE } from '@/lib/transaction-errors';
import { BroadcastService } from '@/services/broadcast';

import { POST } from './route';

const mock = vi.hoisted(() => {
  return {
    broadcast: vi.fn(),
    stake: {
      getByTxid: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      claimSignedPsbt: vi.fn(),
      expireSignedPsbt: vi.fn(),
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

vi.mock('@/server/auth/session', () => ({
  requireSession: requireSessionMock,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

describe('POST', () => {
  const userPsbt = new bitcoin.Psbt().toBase64();
  const canisterPsbt = new bitcoin.Psbt().toBase64();

  beforeEach(() => {
    Object.values(mock.stake).forEach((fn) => fn.mockReset());
    mock.stake.claimSignedPsbt.mockResolvedValue(true);
    mock.stake.expireSignedPsbt.mockResolvedValue(false);
    mock.stake.update.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    mock.stake.getByTxid.mockResolvedValue({
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
    expect(mock.stake.update).toHaveBeenCalledWith([1], { txid: 'test-txid' });
  });

  it('should forward the BroadcastService.Error', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    // Mock database entry with canister signature
    mock.stake.getByTxid.mockResolvedValue({
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
    expect(mock.stake.update).toHaveBeenCalledWith([1], { invalidatedAt: expect.any(Date) });
    expect(mock.stake.remove).not.toHaveBeenCalled();
  });

  it('returns 500 for generic errors', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    // Mock database entry with canister signature
    mock.stake.getByTxid.mockResolvedValue({
      id: 1,
      psbt: canisterPsbt,
      address: 'addr',
      timestamp: new Date(),
    });

    mock.broadcast.mockRejectedValueOnce(new Error('fail'));

    const response = await POST(req);
    expect(response.status).toBe(500);
  });

  it('returns 404 if stake entry not found', async () => {
    const req = { json: () => ({ psbt: userPsbt }) } as unknown as NextRequest;

    // Mock no database entry found
    mock.stake.getByTxid.mockResolvedValue(null);

    const response = await POST(req);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Stake entry not found or missing canister signature',
    });
  });

  describe('canister signature deadline', () => {
    const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    const expiredResponse = {
      error: SIGNATURE_EXPIRED_ERROR_MESSAGE,
      error_code: 'signature_expired',
    };
    const request = () => ({ json: () => ({ psbt: userPsbt }) }) as unknown as NextRequest;

    type Row = {
      id: number;
      address: string;
      psbt: string | null;
      timestamp: Date | null;
      invalidatedAt: Date | null;
      txid: string;
    };

    // In-memory row with the same atomic semantics as the conditional UPDATEs in the db service
    function useRow(overrides: Partial<Row> = {}) {
      const row: Row = {
        id: 1,
        address: 'addr',
        psbt: canisterPsbt,
        timestamp: new Date(T0),
        invalidatedAt: null,
        txid: 'temp-txid',
        ...overrides,
      };
      let exists = true;
      mock.stake.getByTxid.mockImplementation(async () => (exists ? { ...row } : undefined));
      mock.stake.claimSignedPsbt.mockImplementation(
        async (_id: number, psbt: string, signedAfter: Date) => {
          if (row.psbt !== psbt || row.invalidatedAt || !row.timestamp) return false;
          if (row.timestamp < signedAfter) return false;
          row.psbt = null;
          return true;
        },
      );
      mock.stake.expireSignedPsbt.mockImplementation(async (_id: number, signedAfter: Date) => {
        if (!row.psbt || row.invalidatedAt) return false;
        if (row.timestamp && row.timestamp >= signedAfter) return false;
        row.psbt = null;
        row.invalidatedAt = new Date();
        return true;
      });
      mock.stake.update.mockImplementation(async (_ids: number[], payload: Partial<Row>) => {
        Object.assign(row, payload);
      });
      mock.stake.remove.mockImplementation(async () => {
        exists = false;
      });
      return { row, exists: () => exists };
    }

    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    }

    const at = (offsetMs: number) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(T0 + offsetMs);
    };

    it('broadcasts when the signature is just within the deadline', async () => {
      const { row } = useRow();
      at(CANISTER_SIGNATURE_MAX_AGE_MS - 1000);
      mock.broadcast.mockResolvedValue({ txid: 'final-txid', fee: '1000', feeRate: 5 });

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(mock.broadcast).toHaveBeenCalledTimes(1);
      expect(row).toMatchObject({ psbt: null, txid: 'final-txid', invalidatedAt: null });
    });

    it('rejects an expired signature, clears the PSBT and keeps the row', async () => {
      const { row, exists } = useRow();
      at(CANISTER_SIGNATURE_MAX_AGE_MS + 1000);

      const response = await POST(request());

      expect(response.status).toBe(410);
      expect(await response.json()).toEqual(expiredResponse);
      expect(mock.broadcast).not.toHaveBeenCalled();
      expect(exists()).toBe(true);
      expect(row.psbt).toBeNull();
      expect(row.invalidatedAt).toBeInstanceOf(Date);
    });

    it('rejects an entry without a signing timestamp', async () => {
      const { row } = useRow({ timestamp: null });

      const response = await POST(request());

      expect(response.status).toBe(410);
      expect(await response.json()).toEqual(expiredResponse);
      expect(mock.broadcast).not.toHaveBeenCalled();
      expect(row.psbt).toBeNull();
    });

    it('keeps rejecting once the signature was invalidated', async () => {
      useRow();
      at(CANISTER_SIGNATURE_MAX_AGE_MS + 1000);

      expect((await POST(request())).status).toBe(410);
      expect((await POST(request())).status).toBe(410);
      expect(mock.broadcast).not.toHaveBeenCalled();
    });

    it('does not touch an expired entry owned by another wallet', async () => {
      const { row } = useRow({ address: 'someone-else' });
      at(CANISTER_SIGNATURE_MAX_AGE_MS + 1000);

      const response = await POST(request());

      expect(response.status).toBe(403);
      expect(row.psbt).toBe(canisterPsbt);
      expect(row.invalidatedAt).toBeNull();
      expect(mock.broadcast).not.toHaveBeenCalled();
    });

    it('invalidates the claimed row when the broadcast cannot be prepared', async () => {
      const { row } = useRow();
      at(CANISTER_SIGNATURE_MAX_AGE_MS - 1000);
      vi.mocked(BroadcastService).mockImplementationOnce(function () {
        throw new BroadcastService.InvalidExchangeRate();
      });

      const response = await POST(request());

      expect(response.status).toBe(400);
      expect(row.psbt).toBeNull();
      expect(row.invalidatedAt).toBeInstanceOf(Date);
    });

    it('still succeeds and keeps the row live if recording the txid fails', async () => {
      const { row } = useRow();
      at(CANISTER_SIGNATURE_MAX_AGE_MS - 1000);
      mock.broadcast.mockResolvedValue({ txid: 'final-txid', fee: '1000', feeRate: 5 });
      mock.stake.update.mockRejectedValueOnce(new Error('db down'));

      const response = await POST(request());

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ txid: 'final-txid' });
      expect(row.invalidatedAt).toBeNull();
    });

    it('keeps the broadcast error if invalidating the row fails', async () => {
      useRow();
      at(CANISTER_SIGNATURE_MAX_AGE_MS - 1000);
      mock.broadcast.mockRejectedValue(new BroadcastService.InvalidExchangeRate());
      mock.stake.update.mockRejectedValueOnce(new Error('db down'));

      const response = await POST(request());

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: new BroadcastService.InvalidExchangeRate().message,
      });
    });

    it('lets only one of two concurrent confirms broadcast', async () => {
      const { row } = useRow();
      at(CANISTER_SIGNATURE_MAX_AGE_MS - 1000);
      mock.broadcast.mockResolvedValue({ txid: 'final-txid', fee: '1000', feeRate: 5 });

      const responses = await Promise.all([POST(request()), POST(request())]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(mock.broadcast).toHaveBeenCalledTimes(1);
      expect(row).toMatchObject({ txid: 'final-txid', invalidatedAt: null });
    });

    it('does not lose a broadcast when a retry crosses the deadline mid-broadcast', async () => {
      const { row, exists } = useRow();
      const pending = deferred<{ txid: string; fee: string; feeRate: number }>();
      mock.broadcast.mockReturnValueOnce(pending.promise);

      // Request A claims the signature just before the deadline and starts broadcasting
      at(CANISTER_SIGNATURE_MAX_AGE_MS - 1000);
      const first = POST(request());
      await vi.waitFor(() => expect(mock.broadcast).toHaveBeenCalledTimes(1));

      // Request B arrives after the deadline while A is still broadcasting
      at(CANISTER_SIGNATURE_MAX_AGE_MS + 1000);
      const second = await POST(request());
      expect(second.status).toBe(409);
      expect(row.invalidatedAt).toBeNull();

      pending.resolve({ txid: 'final-txid', fee: '1000', feeRate: 5 });
      expect((await first).status).toBe(200);

      expect(mock.broadcast).toHaveBeenCalledTimes(1);
      expect(exists()).toBe(true);
      expect(row).toMatchObject({ txid: 'final-txid', psbt: null, invalidatedAt: null });
      expect(mock.stake.remove).not.toHaveBeenCalled();
    });
  });
});
