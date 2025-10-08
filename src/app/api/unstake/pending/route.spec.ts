import { describe, it, expect, vi, beforeEach } from 'vitest';

const mock = vi.hoisted(() => ({
  mempool: {
    blocks: { getBlocksTipHeight: vi.fn() },
    transactions: { getTx: vi.fn() },
  },
  db: {
    unstake: {
      getPendingsOf: vi.fn(),
      getWithdrawAfterBlock: vi.fn(),
    },
  },
}));

vi.mock('@/providers/mempool', () => ({ mempool: mock.mempool }));
vi.mock('@/db', () => ({
  db: {
    unstake: {
      getPendingsOf: mock.db.unstake.getPendingsOf,
      getWithdrawAfterBlock: mock.db.unstake.getWithdrawAfterBlock,
    },
  },
}));

import { GET } from './route';

describe('GET /api/unstake/pending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty withdrawals
    mock.db.unstake.getWithdrawAfterBlock.mockResolvedValue([]);
  });

  it('should return 400 if address is missing', async () => {
    const request = new Request('http://localhost/api/unstake/pending');
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing address' });
  });

  it('should return pending unstakes for an address', async () => {
    const address = 'test-address';
    const lastBlock = 100;
    const unstakes = [
      { txid: 'tx1', amount: '100', claimTx: null },
      { txid: 'tx2', amount: '200', claimTx: null },
    ];
    const txs = [
      { fee: 1000, locktime: 0, size: 200, status: { confirmed: true } },
      { fee: 2000, locktime: 0, size: 300, status: { confirmed: false } },
    ];

    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValue(lastBlock);
    mock.db.unstake.getPendingsOf.mockResolvedValue(unstakes);
    mock.mempool.transactions.getTx.mockImplementation(({ txid }) => {
      return Promise.resolve(txs[unstakes.findIndex((unstake) => unstake.txid === txid)]);
    });

    const request = new Request(`http://localhost/api/unstake/pending?address=${address}`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      entries: [
        { ...txs[0], ...unstakes[0] },
        { ...txs[1], ...unstakes[1] },
      ],
      last_block: lastBlock,
    });

    expect(mock.mempool.blocks.getBlocksTipHeight).toHaveBeenCalledTimes(1);
    expect(mock.db.unstake.getPendingsOf).toHaveBeenCalledWith(address);
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledTimes(2);
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledWith({ txid: 'tx1' });
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledWith({ txid: 'tx2' });
  });

  it('should return withdrawal entries in progress for an address', async () => {
    const address = 'test-address';
    const lastBlock = 100;
    const withdrawalCandidates = [
      {
        id: 1,
        address: 'test-address',
        txid: 'withdraw-tx1',
        amount: '500',
        sAmount: '2500',
        claimTx: 'claim-tx1',
        claimTxBlock: null,
      },
      {
        id: 2,
        address: 'test-address',
        txid: 'withdraw-tx2',
        amount: '300',
        sAmount: '1500',
        claimTx: 'claim-tx2',
        claimTxBlock: 95,
      },
      {
        id: 3,
        address: 'other-address', // Different address - should be filtered out
        txid: 'withdraw-tx3',
        amount: '200',
        sAmount: '1000',
        claimTx: 'claim-tx3',
        claimTxBlock: null,
      },
    ];
    const baseTxs = [
      { fee: 1500, locktime: 0, size: 250, status: { confirmed: true }, txid: 'withdraw-tx1' },
      { fee: 1200, locktime: 0, size: 200, status: { confirmed: true }, txid: 'withdraw-tx2' },
    ];
    const claimTxs = [
      { fee: 800, locktime: 0, size: 150, status: { confirmed: false }, txid: 'claim-tx1' },
      { fee: 600, locktime: 0, size: 120, status: { confirmed: true }, txid: 'claim-tx2' },
    ];

    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValue(lastBlock);
    mock.db.unstake.getPendingsOf.mockResolvedValue([]); // No pending unstakes
    mock.db.unstake.getWithdrawAfterBlock.mockResolvedValue(withdrawalCandidates);

    // Mock getTx to return different data based on txid
    mock.mempool.transactions.getTx.mockImplementation(({ txid }) => {
      if (txid === 'withdraw-tx1') return Promise.resolve(baseTxs[0]);
      if (txid === 'withdraw-tx2') return Promise.resolve(baseTxs[1]);
      if (txid === 'claim-tx1') return Promise.resolve(claimTxs[0]);
      if (txid === 'claim-tx2') return Promise.resolve(claimTxs[1]);
      return Promise.resolve(null);
    });

    const request = new Request(`http://localhost/api/unstake/pending?address=${address}`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      entries: [
        {
          fee: 1500,
          locktime: 0,
          size: 250,
          status: { confirmed: true },
          id: 1,
          address: 'test-address',
          txid: 'withdraw-tx1',
          amount: '500',
          sAmount: '2500',
          claimTx: {
            fee: 800,
            locktime: 0,
            status: { confirmed: false },
            txid: 'claim-tx1',
          },
          claimTxBlock: null,
        },
        {
          fee: 1200,
          locktime: 0,
          size: 200,
          status: { confirmed: true },
          id: 2,
          address: 'test-address',
          txid: 'withdraw-tx2',
          amount: '300',
          sAmount: '1500',
          claimTx: {
            fee: 600,
            locktime: 0,
            status: { confirmed: true },
            txid: 'claim-tx2',
          },
          claimTxBlock: 95,
        },
      ],
      last_block: lastBlock,
    });

    expect(mock.mempool.blocks.getBlocksTipHeight).toHaveBeenCalledTimes(1);
    expect(mock.db.unstake.getPendingsOf).toHaveBeenCalledWith(address);
    expect(mock.db.unstake.getWithdrawAfterBlock).toHaveBeenCalledWith(lastBlock);
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledTimes(4); // 2 base txs + 2 claim txs
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledWith({ txid: 'withdraw-tx1' });
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledWith({ txid: 'withdraw-tx2' });
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledWith({ txid: 'claim-tx1' });
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledWith({ txid: 'claim-tx2' });
  });

  it('should return both pending unstakes and withdrawal entries', async () => {
    const address = 'test-address';
    const lastBlock = 100;
    const unstakes = [{ txid: 'unstake-tx1', amount: '100', claimTx: null }];
    const withdrawalCandidates = [
      {
        id: 1,
        address: 'test-address',
        txid: 'withdraw-tx1',
        amount: '500',
        sAmount: '2500',
        claimTx: 'claim-tx1',
        claimTxBlock: null,
      },
    ];
    const unstakeTx = { fee: 1000, locktime: 0, size: 200, status: { confirmed: true } };
    const baseTx = {
      fee: 1500,
      locktime: 0,
      size: 250,
      status: { confirmed: true },
      txid: 'withdraw-tx1',
    };
    const claimTx = {
      fee: 800,
      locktime: 0,
      size: 150,
      status: { confirmed: false },
      txid: 'claim-tx1',
    };

    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValue(lastBlock);
    mock.db.unstake.getPendingsOf.mockResolvedValue(unstakes);
    mock.db.unstake.getWithdrawAfterBlock.mockResolvedValue(withdrawalCandidates);

    mock.mempool.transactions.getTx.mockImplementation(({ txid }) => {
      if (txid === 'unstake-tx1') return Promise.resolve(unstakeTx);
      if (txid === 'withdraw-tx1') return Promise.resolve(baseTx);
      if (txid === 'claim-tx1') return Promise.resolve(claimTx);
      return Promise.resolve(null);
    });

    const request = new Request(`http://localhost/api/unstake/pending?address=${address}`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(2);
    expect(data.entries[0]).toEqual({
      ...unstakeTx,
      ...unstakes[0],
      claimTx: null,
    });
    expect(data.entries[1]).toEqual({
      fee: 1500,
      locktime: 0,
      size: 250,
      status: { confirmed: true },
      id: 1,
      address: 'test-address',
      txid: 'withdraw-tx1',
      amount: '500',
      sAmount: '2500',
      claimTx: {
        fee: 800,
        locktime: 0,
        status: { confirmed: false },
        txid: 'claim-tx1',
      },
      claimTxBlock: null,
    });
  });

  it('should handle withdrawal candidates with null claimTx', async () => {
    const address = 'test-address';
    const lastBlock = 100;
    const withdrawalCandidates = [
      {
        id: 1,
        address: 'test-address',
        txid: 'withdraw-tx1',
        amount: '500',
        sAmount: '2500',
        claimTx: null, // No claim transaction yet
        claimTxBlock: null,
      },
    ];
    const baseTx = {
      fee: 1500,
      locktime: 0,
      size: 250,
      status: { confirmed: true },
      txid: 'withdraw-tx1',
    };

    mock.mempool.blocks.getBlocksTipHeight.mockResolvedValue(lastBlock);
    mock.db.unstake.getPendingsOf.mockResolvedValue([]);
    mock.db.unstake.getWithdrawAfterBlock.mockResolvedValue(withdrawalCandidates);
    mock.mempool.transactions.getTx.mockResolvedValue(baseTx);

    const request = new Request(`http://localhost/api/unstake/pending?address=${address}`);
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(0); // Should be filtered out since claimTx is null
    expect(mock.mempool.transactions.getTx).toHaveBeenCalledTimes(0); // No transactions fetched
  });
});
