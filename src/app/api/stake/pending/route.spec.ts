import { describe, it, expect, vi, beforeEach } from 'vitest';

const mock = vi.hoisted(() => ({
  mempool: {
    blocks: { getBlocksTipHeight: vi.fn() },
    transactions: { getTx: vi.fn() },
  },
  db: {
    stake: { getPendingsOf: vi.fn() },
  },
  requireSession: vi.fn(),
}));

vi.mock('@/providers/mempool', () => ({ mempool: mock.mempool }));
vi.mock('@/db', () => ({ db: mock.db }));
vi.mock('@/server/auth/session', () => ({
  requireSession: mock.requireSession,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { GET } from './route';

describe('GET /api/stake/pending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.requireSession.mockImplementation(async (request: Request) => ({
      address: new URL(request.url).searchParams.get('address'),
    }));
  });

  it('should return 400 if address is missing', async () => {
    const request = new Request('http://localhost/api/stake/pending');
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing address' });
  });

  it('rejects a session for a different wallet before provider work', async () => {
    mock.requireSession.mockResolvedValueOnce({ address: 'different-address' });
    const request = new Request('http://localhost/api/stake/pending?address=test-address');

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(mock.db.stake.getPendingsOf).not.toHaveBeenCalled();
    expect(mock.mempool.transactions.getTx).not.toHaveBeenCalled();
  });

  it('should return pending stakes for an address', async () => {
    const address = 'test-address';
    const lastBlock = 100;
    const stakes = [
      { txid: 'tx1', amount: '100' },
      { txid: 'tx2', amount: '200' },
    ];
    const txs = [
      { fee: 1000, locktime: 0, size: 200, status: { confirmed: true } },
      { fee: 2000, locktime: 0, size: 300, status: { confirmed: false } },
    ];

    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValue(lastBlock);
    mock.db.stake.getPendingsOf.mockResolvedValue(stakes);
    mock.mempool.transactions.getTx.mockImplementation(({ txid }) => {
      return Promise.resolve(txs[stakes.findIndex((stake) => stake.txid === txid)]);
    });

    const request = new Request(`http://localhost/api/stake/pending?address=${address}`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      entries: [
        { ...txs[0], ...stakes[0] },
        { ...txs[1], ...stakes[1] },
      ],
      last_block: lastBlock,
    });

    expect(mock.mempool.blocks.getBlocksTipHeight).toHaveBeenCalledTimes(1);
    expect(mock.db.stake.getPendingsOf).toHaveBeenCalledWith(address);
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledTimes(2);
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledWith({ txid: 'tx1' });
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledWith({ txid: 'tx2' });
  });
});
