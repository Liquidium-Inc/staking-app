import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { config } from '@/config/config';
import { config as publicConfig } from '@/config/public';

import { GET } from './route';

const mock = vi.hoisted(() => ({
  mempool: {
    blocks: { getBlocksTipHeight: vi.fn() },
    transactions: { getTxStatus: vi.fn() },
  },
  db: {
    unstake: { getMonitorBatch: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/providers/mempool', () => ({ mempool: mock.mempool }));
vi.mock('@/db', () => ({ db: mock.db }));

function createRequest(token: string | undefined) {
  const request = new NextRequest('http://localhost/api/cron/monitor/unstake');
  if (token) request.headers.set('authorization', `Bearer ${token}`);
  return request;
}

const expectedConfirmations = publicConfig.protocol.expectedConfirmations;

describe('GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if authorization header is missing', async () => {
    const req = createRequest(undefined);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 if authorization header is invalid', async () => {
    const req = createRequest('wrong-secret');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns success and updates unstakes as expected', async () => {
    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValue(100);
    mock.mempool.transactions.getTxStatus
      .mockResolvedValueOnce({ confirmed: true, block_height: 90 })
      .mockResolvedValueOnce({ confirmed: true, block_height: 90 });
    mock.db.unstake.getMonitorBatch.mockResolvedValue([]).mockResolvedValueOnce([
      { id: 1, txid: 'tx1' },
      { id: 2, txid: 'tx2' },
    ]);

    const req = createRequest(config.secrets.cron);
    const res = await GET(req);

    expect(res).toBeDefined();
    const json = await res.json();
    expect(json).toEqual({ success: true });

    expect(mock.mempool.blocks.getBlocksTipHeight).toHaveBeenCalled();
    expect(mock.db.unstake.getMonitorBatch).toHaveBeenCalledWith(100 - expectedConfirmations);
    expect(mock.mempool.transactions.getTxStatus).toHaveBeenCalledTimes(2);
    expect(mock.db.unstake.update).toHaveBeenCalledWith([1, 2], {
      block: 90,
      invalidatedAt: null,
      psbt: null,
    });
  });

  it('retires signatures of unstakes the network knows about, confirmed or not', async () => {
    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValue(100);
    mock.mempool.transactions.getTxStatus
      .mockResolvedValueOnce({ confirmed: false })
      .mockResolvedValueOnce({ confirmed: true, block_height: 99 })
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce({ confirmed: false });
    mock.db.unstake.getMonitorBatch.mockResolvedValue([]).mockResolvedValueOnce([
      { id: 1, txid: 'tx1', invalidatedAt: new Date() },
      { id: 2, txid: 'tx2', invalidatedAt: new Date() },
      { id: 3, txid: 'tx3', invalidatedAt: new Date() },
      { id: 4, txid: 'tx4', invalidatedAt: null },
    ]);

    await GET(createRequest(config.secrets.cron));

    expect(mock.db.unstake.update).toHaveBeenCalledTimes(1);
    expect(mock.db.unstake.update).toHaveBeenCalledWith([1, 2], {
      psbt: null,
      invalidatedAt: null,
    });
  });

  it('does not update if confirmations are not enough', async () => {
    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValue(95);
    mock.db.unstake.getMonitorBatch
      .mockResolvedValue([])
      .mockResolvedValueOnce([{ id: 1, txid: 'tx1' }]);
    mock.mempool.transactions.getTxStatus.mockResolvedValueOnce({
      confirmed: true,
      block_height: 94,
    });

    const req = createRequest(config.secrets.cron);
    const res = await GET(req);

    expect(mock.db.unstake.update).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json).toEqual({ success: true });
  });

  it('filters out unconfirmed transactions', async () => {
    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValue(100);
    mock.db.unstake.getMonitorBatch.mockResolvedValue([]).mockResolvedValueOnce([
      { id: 1, txid: 'tx1' },
      { id: 2, txid: 'tx2' },
    ]);
    mock.mempool.transactions.getTxStatus
      .mockResolvedValueOnce({ confirmed: false, block_height: 90 })
      .mockResolvedValueOnce({ confirmed: true, block_height: 90 });

    const req = createRequest(config.secrets.cron);
    const res = await GET(req);

    expect(mock.db.unstake.update).toHaveBeenCalledWith([2], {
      block: 90,
      invalidatedAt: null,
      psbt: null,
    });
    const json = await res.json();
    expect(json).toEqual({ success: true });
  });
});
