import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371';
import { ECPairFactory } from 'ecpair';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { canister } from '@/providers/canister';

import { POST } from './route';

const mocks = vi.hoisted(() => ({
  mempool: {
    fees: { getFeesRecommended: vi.fn().mockImplementation(() => ({ fastestFee: 1 })) },
    transactions: { getTx: vi.fn() },
  },
  BIS: { mempool: { cardinalUTXOs: vi.fn().mockResolvedValue({ data: [] }) } },
  RunePSBT: {
    build: vi.fn(),
  },
}));

const requireSessionMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: 1,
    address: 'addr',
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

describe('POST /api/withdraw', () => {
  const user = getUser();

  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValue({
      id: 1,
      address: user.address,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastActiveAt: new Date(),
    });
  });

  it('returns 400 if body is invalid', async () => {
    const req = {
      json: vi.fn().mockResolvedValue({}),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it('returns 400 if sender is not the owner of the tx', async () => {
    mocks.mempool.transactions.getTx.mockResolvedValue({
      vout: [{ scriptpubkey_address: 'not-sender', value: 1000, index: 0 }],
    });
    const req = {
      json: vi.fn().mockResolvedValue({
        txid: 'txid1',
        sender: { address: user.address, public: user.publicKey },
      }),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Sender is not the owner of the tx');
  });

  it('returns 400 if no UTXOs found', async () => {
    mocks.mempool.transactions.getTx.mockResolvedValue({
      vout: [
        { scriptpubkey_address: 'other-address', value: 1000, index: 0 },
        { scriptpubkey_address: user.address, value: 1000, index: 1 },
      ],
    });
    const req = {
      json: vi.fn().mockResolvedValue({
        txid: 'txid1',
        sender: { address: user.address, public: user.publicKey },
      }),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('No UTXOs found');
  });

  it('returns 400 if not enough balance to pay fees', async () => {
    mocks.mempool.transactions.getTx.mockResolvedValue({
      vout: [
        { scriptpubkey_address: user.address, value: 1000, index: 0 },
        { scriptpubkey_address: canister.retention, value: 1000, index: 1 },
      ],
    });
    mocks.mempool.fees.getFeesRecommended.mockResolvedValue({ fastestFee: 1 });
    mocks.BIS.mempool.cardinalUTXOs.mockResolvedValue({ data: [] });

    mocks.RunePSBT.build.mockRejectedValue(new Error('Insufficient balance'));

    const req = {
      json: vi.fn().mockResolvedValue({
        txid: 'txid1',
        sender: { address: user.address, public: user.publicKey },
      }),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Not enough balance to pay fees');
  });

  it('returns 200 and psbt if all is valid', async () => {
    mocks.mempool.transactions.getTx.mockResolvedValue({
      vout: [
        { scriptpubkey_address: user.address, value: 1000, index: 0 },
        { scriptpubkey_address: canister.retention, value: 2000, index: 1 },
      ],
    });
    mocks.mempool.fees.getFeesRecommended.mockResolvedValue({ fastestFee: 1 });
    mocks.BIS.mempool.cardinalUTXOs.mockResolvedValue({
      data: [{ txid: 'utxo1', vout: 0, value: 10000000, address: user.paymentAddress }],
    });
    const psbt = new bitcoin.Psbt();
    mocks.RunePSBT.build.mockResolvedValueOnce(psbt);

    const req = {
      json: vi.fn().mockResolvedValue({
        txid: 'txid1',
        sender: { address: user.address, public: user.publicKey },
        payer: { address: user.paymentAddress, public: user.publicKey },
        feeRate: 5,
      }),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.psbt).toBe(psbt.toBase64());
    expect(json.sender.address).toEqual(user.address);
    expect(json.payer.address).toEqual(user.paymentAddress);
    expect(json.feeRate).toBe(5);
    expect(Array.isArray(json.toSign)).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    const req = {
      json: vi.fn().mockRejectedValue(new Error('Unexpected')),
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal server error');
  });
});
