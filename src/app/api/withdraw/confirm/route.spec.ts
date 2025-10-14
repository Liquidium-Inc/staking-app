import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { ECPairFactory } from 'ecpair';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { config as publicConfig } from '@/config/public';
import { canister } from '@/providers/canister';

import { POST } from './route';

const mocks = vi.hoisted(() => ({
  mempool: {
    fees: { getFeesRecommended: vi.fn().mockImplementation(() => ({ fastestFee: 1 })) },
    transactions: {
      getTx: vi.fn(),
      postTx: vi.fn(),
    },
  },
  BIS: { mempool: { cardinalUTXOs: vi.fn().mockResolvedValue({ data: [] }) } },
  RunePSBT: {
    build: vi.fn(),
  },
  db: {
    unstake: {
      getByTxid: vi.fn(),
      update: vi.fn(),
    },
  },
  redis: {
    utxo: {
      lock: vi.fn().mockResolvedValue(true),
      extend: vi.fn().mockResolvedValue(true),
      free: vi.fn().mockResolvedValue(true),
    },
  },
}));

const requireSessionMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 1,
    address: 'sender-address',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    lastActiveAt: new Date(),
  }),
);

vi.mock('@/lib/psbt', () => ({
  RunePSBT: vi.fn().mockImplementation(() => ({
    setPayer: vi.fn().mockReturnThis(),
    addInput: vi.fn().mockReturnThis(),
    addOutput: vi.fn().mockReturnThis(),
    build: mocks.RunePSBT.build,
    inputs: [],
  })),
}));
vi.mock('@/providers/bestinslot', () => ({
  BIS: mocks.BIS,
}));
vi.mock('@/providers/mempool', () => ({
  mempool: mocks.mempool,
}));
vi.mock('@/db', () => ({
  db: mocks.db,
}));
vi.mock('@/providers/redis', () => ({
  redis: mocks.redis,
}));
vi.mock('@/server/auth/session', () => ({
  requireSession: requireSessionMock,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

const getUser = () => {
  const network = bitcoin.networks.testnet;
  const ECPair = ECPairFactory(ecc);
  const keyPair = ECPair.makeRandom({ network });
  const paymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network }).address;
  const address = bitcoin.payments.p2tr({ pubkey: toXOnly(keyPair.publicKey), network }).address;
  return {
    keyPair: keyPair,
    publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
    address: address || '',
    paymentAddress: paymentAddress || '',
    network,
  };
};

describe('POST /api/withdraw/confirm', () => {
  const user = getUser();
  const mockTxId = '1234567890123456789012345678901234567890123456789012345678901234';
  let mockPsbt: bitcoin.Psbt;

  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValue({
      id: 1,
      address: user.address,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastActiveAt: new Date(),
    });
    mocks.redis.utxo.lock.mockResolvedValue(true);
    mocks.redis.utxo.extend.mockResolvedValue(true);
    mocks.redis.utxo.free.mockResolvedValue(true);

    // Create a mock PSBT with the correct retention address
    mockPsbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
    mockPsbt.addInput({
      hash: Buffer.from(mockTxId, 'hex'),
      index: 0,
      witnessUtxo: {
        script: bitcoin.address.toOutputScript(canister.retention, canister.network),
        value: 100000n,
      },
    });

    mockPsbt.addOutput({
      address: user.address,
      value: 90000n,
    });
  });

  it('returns 400 if body is invalid', async () => {
    const req = { json: vi.fn().mockResolvedValue({}) };
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 404 if unstake transaction is not found', async () => {
    mocks.mempool.transactions.getTx.mockResolvedValue(null);

    const req = {
      json: vi.fn().mockResolvedValue({
        sender: user.address,
        psbt: mockPsbt.toBase64(),
      }),
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Unstake tx not found');
  });

  it('returns 400 if sender is not the owner', async () => {
    mocks.mempool.transactions.getTx.mockResolvedValue({
      txid: mockTxId,
      vout: [
        { scriptpubkey_address: 'different_address' },
        { scriptpubkey_address: canister.retention },
      ],
      status: {
        confirmed: true,
        block_time: Math.floor(Date.now() / 1000) - publicConfig.protocol.withdrawTime - 3600,
        block_height: 800000,
        block_hash: 'test_hash',
      },
    });

    const req = {
      json: vi.fn().mockResolvedValue({
        sender: user.address,
        psbt: mockPsbt.toBase64(),
      }),
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Sender is not the owner of the tx');
  });

  it('returns 400 if transaction is not a retention output', async () => {
    mocks.mempool.transactions.getTx.mockResolvedValue({
      txid: mockTxId,
      vout: [{ scriptpubkey_address: user.address }, { scriptpubkey_address: 'different_address' }],
      status: {
        confirmed: true,
        block_time: Math.floor(Date.now() / 1000) - publicConfig.protocol.withdrawTime - 3600,
        block_height: 800000,
        block_hash: 'test_hash',
      },
    });

    const req = {
      json: vi.fn().mockResolvedValue({
        sender: user.address,
        psbt: mockPsbt.toBase64(),
      }),
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Unstake tx is not a retention output');
  });

  it('returns 400 if unstake transaction is not confirmed', async () => {
    mocks.mempool.transactions.getTx.mockResolvedValue({
      txid: mockTxId,
      vout: [{ scriptpubkey_address: user.address }, { scriptpubkey_address: canister.retention }],
      status: { confirmed: false },
    });

    const req = {
      json: vi.fn().mockResolvedValue({
        sender: user.address,
        psbt: mockPsbt.toBase64(),
      }),
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Unstake transaction is not yet confirmed');
  });

  it('returns 400 if withdrawal time has not elapsed', async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    mocks.mempool.transactions.getTx.mockResolvedValue({
      txid: mockTxId,
      vout: [{ scriptpubkey_address: user.address }, { scriptpubkey_address: canister.retention }],
      status: {
        confirmed: true,
        block_time: currentTime - publicConfig.protocol.withdrawTime / 2,
        block_height: 800000,
        block_hash: 'test_hash',
      },
    });

    const req = {
      json: vi.fn().mockResolvedValue({
        sender: user.address,
        psbt: mockPsbt.toBase64(),
      }),
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Unstake will be available in');
  });

  it('successfully processes a valid withdrawal', async () => {
    mocks.mempool.transactions.getTx.mockResolvedValue({
      txid: mockTxId,
      vout: [{ scriptpubkey_address: user.address }, { scriptpubkey_address: canister.retention }],
      status: {
        confirmed: true,
        block_time: Math.floor(Date.now() / 1000) - publicConfig.protocol.withdrawTime - 3600,
        block_height: 800000,
        block_hash: 'test_hash',
      },
    });

    mocks.db.unstake.getByTxid.mockResolvedValue({ id: 1, txid: mockTxId, address: user.address });

    const req = {
      json: vi.fn().mockResolvedValue({
        sender: user.address,
        psbt: mockPsbt.toBase64(),
      }),
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.psbt).toBeDefined();
    expect(json.tx).toBeDefined();
    expect(json.txid).toBeDefined();
    expect(json.fee).toBeDefined();
    expect(json.feeRate).toBeDefined();

    expect(mocks.mempool.transactions.postTx).toHaveBeenCalled();
    expect(mocks.db.unstake.update).toHaveBeenCalledWith([1], { claimTx: expect.any(String) });
  });
});
