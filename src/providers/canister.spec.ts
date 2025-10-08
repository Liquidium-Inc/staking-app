import { describe, it, expect, vi, beforeEach } from 'vitest';

import { canister, CanisterService } from './canister';

const mocks = vi.hoisted(() => ({
  HttpAgent: {
    createSync: vi.fn().mockReturnValue({}),
  },
  Actor: {
    stake: vi.fn(),
    unstake: vi.fn(),
    withdraw: vi.fn(),
    get_exchange_rate_components: vi.fn(),
    update_exchange_rate: vi.fn(),
  },
  Secp256k1KeyIdentity: {
    fromSecretKey: vi.fn().mockReturnValue({}),
  },
}));

// Mock dependencies
vi.mock('@dfinity/agent', () => ({
  HttpAgent: mocks.HttpAgent,
  Actor: { createActor: vi.fn().mockReturnValue(mocks.Actor) },
}));

vi.mock('@dfinity/identity-secp256k1', () => ({
  Secp256k1KeyIdentity: mocks.Secp256k1KeyIdentity,
}));

describe('CanisterService', () => {
  let canisterService: CanisterService;

  beforeEach(() => {
    vi.clearAllMocks();
    canisterService = new CanisterService(
      canister.id,
      canister.address,
      canister.retention,
      canister.network,
      'test-oracle-secret',
      'https://test-host.com',
    );
  });

  describe('stake', () => {
    it('should process stake transaction successfully', async () => {
      const mockPsbt = 'mock-psbt';
      const mockResponse = JSON.stringify({
        signed_psbt: 'signed-psbt',
        debug: {},
      });

      mocks.Actor.stake.mockResolvedValue(mockResponse);

      const result = await canisterService.stake(mockPsbt);

      expect(result).toEqual({
        signed_psbt: 'signed-psbt',
        debug: {},
      });
    });

    it('should throw error on invalid PSBT result', async () => {
      const mockPsbt = 'mock-psbt';

      mocks.Actor.stake.mockResolvedValue(undefined);

      await expect(canisterService.stake(mockPsbt)).rejects.toThrow('Invalid PSBT Result');
    });
  });

  describe('getExchangeRate', () => {
    it('should return exchange rate components successfully', async () => {
      const mockResponse = {
        Ok: [BigInt(1000), BigInt(2000)],
      };

      mocks.Actor.get_exchange_rate_components.mockResolvedValue(mockResponse);

      const result = await canisterService.getExchangeRate();

      expect(result).toEqual({
        circulating: BigInt(1000),
        balance: BigInt(2000),
      });
    });

    it('should throw error when exchange rate fetch fails', async () => {
      const mockError = 'Failed to fetch exchange rate';
      const mockResponse = {
        Err: mockError,
      };

      mocks.Actor.get_exchange_rate_components.mockResolvedValue(mockResponse);

      await expect(canisterService.getExchangeRate()).rejects.toThrow(mockError);
    });
  });

  describe('pushExchangeRate', () => {
    it('should update exchange rate successfully', async () => {
      const mockCirculating = BigInt(1000);
      const mockBalance = BigInt(2000);
      const mockResponse = { Ok: true };

      mocks.Actor.update_exchange_rate.mockResolvedValue(mockResponse);

      const result = await canisterService.pushExchangeRate(mockCirculating, mockBalance);

      expect(result).toEqual(mockResponse);
    });
  });
});
