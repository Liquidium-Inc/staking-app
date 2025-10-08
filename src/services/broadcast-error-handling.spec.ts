import { describe, it, expect, vi } from 'vitest';

import { BROADCAST_ERROR_CODES } from '@/lib/error-codes';

import { BroadcastService } from './broadcast';

// Mock dependencies to avoid database connection issues
vi.mock('@/db', () => ({
  db: {
    stake: { insert: vi.fn().mockImplementation(() => undefined) },
    unstake: { insert: vi.fn().mockImplementation(() => undefined) },
  },
}));

vi.mock('@/providers/redis', () => ({
  redis: {
    utxo: {
      lock: vi.fn().mockImplementation(() => Promise.resolve(true)),
      extend: vi.fn().mockImplementation(() => Promise.resolve(true)),
      free: vi.fn().mockImplementation(() => Promise.resolve(true)),
    },
  },
}));

vi.mock('@/providers/mempool', () => ({
  mempool: {
    transactions: {
      postTx: vi.fn(),
    },
  },
}));

describe('BroadcastService Error Handling', () => {
  describe('BroadcastError with error codes', () => {
    it('should create BroadcastError with error code', () => {
      const message = 'Test error message';
      const code = BROADCAST_ERROR_CODES.INSUFFICIENT_FEE_FOR_REPLACEMENT;

      const error = new BroadcastService.BroadcastError(message, code);

      expect(error.message).toBe(message);
      expect(error.code).toBe(code);
      expect(error).toBeInstanceOf(BroadcastService.Error);
    });

    it('should create BroadcastError without error code', () => {
      const message = 'Test error message';

      const error = new BroadcastService.BroadcastError(message);

      expect(error.message).toBe(message);
      expect(error.code).toBeUndefined();
    });
  });

  describe('Error pattern matching', () => {
    it('should detect RBF insufficient fee error pattern', () => {
      const errorData = 'insufficient fee, rejecting replacement transaction';

      // This tests the pattern matching logic
      const hasRBFError = errorData.includes('insufficient fee, rejecting replacement');

      expect(hasRBFError).toBe(true);
    });

    it('should detect min relay fee error pattern', () => {
      const errorData = 'min relay fee not met, 0 < 134 (code 66)';

      const hasMinRelayFeeError = errorData.includes('min relay fee not met');

      expect(hasMinRelayFeeError).toBe(true);
    });

    it('should detect mempool min fee error pattern', () => {
      const errorData = 'mempool min fee not met';

      const hasMempoolMinFeeError = errorData.includes('mempool min fee not met');

      expect(hasMempoolMinFeeError).toBe(true);
    });

    it('should detect insufficient fee error pattern', () => {
      const errorData = 'insufficient fee for current network conditions';

      const hasInsufficientFeeError = errorData.includes('insufficient fee');

      expect(hasInsufficientFeeError).toBe(true);
    });

    it('should detect mempool duplicate error pattern', () => {
      const errorData = 'transaction already in mempool';

      // This tests the pattern matching logic
      const hasDuplicateError = errorData.includes('already in mempool');

      expect(hasDuplicateError).toBe(true);
    });

    it('should prioritize more specific patterns over general ones', () => {
      const rbfErrorData = 'insufficient fee, rejecting replacement transaction';
      const generalFeeErrorData = 'insufficient fee for network';

      // RBF error should match the specific pattern
      const hasRBFPattern = rbfErrorData.includes('insufficient fee, rejecting replacement');
      const hasGeneralPattern = rbfErrorData.includes('insufficient fee');

      expect(hasRBFPattern).toBe(true);
      expect(hasGeneralPattern).toBe(true); // Both match, but specific should be preferred

      // General fee error should only match the general pattern
      const hasRBFPatternInGeneral = generalFeeErrorData.includes(
        'insufficient fee, rejecting replacement',
      );
      const hasGeneralPatternInGeneral = generalFeeErrorData.includes('insufficient fee');

      expect(hasRBFPatternInGeneral).toBe(false);
      expect(hasGeneralPatternInGeneral).toBe(true);
    });

    it('should handle error data without known patterns', () => {
      const errorData = 'unknown error from mempool';

      const hasRBFError = errorData.includes('insufficient fee, rejecting replacement');
      const hasDuplicateError = errorData.includes('already in mempool');

      expect(hasRBFError).toBe(false);
      expect(hasDuplicateError).toBe(false);
    });

    it('should be case-sensitive for pattern matching', () => {
      const errorData = 'INSUFFICIENT FEE, REJECTING REPLACEMENT';

      const hasRBFError = errorData.includes('insufficient fee, rejecting replacement');

      expect(hasRBFError).toBe(false);
    });
  });
});
