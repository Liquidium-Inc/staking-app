import { describe, it, expect } from 'vitest';

import { MEMPOOL_ERROR_PATTERNS, BROADCAST_ERROR_CODES, ERROR_CODE_MESSAGES } from './error-codes';

describe('error-codes', () => {
  describe('MEMPOOL_ERROR_PATTERNS', () => {
    it('should map RBF insufficient fee error correctly', () => {
      const errorPattern = 'insufficient fee, rejecting replacement';
      const expectedCode = BROADCAST_ERROR_CODES.INSUFFICIENT_FEE_FOR_REPLACEMENT;

      expect(MEMPOOL_ERROR_PATTERNS[errorPattern]).toBe(expectedCode);
    });

    it('should map min relay fee error correctly', () => {
      const errorPattern = 'min relay fee not met';
      const expectedCode = BROADCAST_ERROR_CODES.MIN_RELAY_FEE_NOT_MET;

      expect(MEMPOOL_ERROR_PATTERNS[errorPattern]).toBe(expectedCode);
    });

    it('should map mempool min fee error correctly', () => {
      const errorPattern = 'mempool min fee not met';
      const expectedCode = BROADCAST_ERROR_CODES.MEMPOOL_MIN_FEE_NOT_MET;

      expect(MEMPOOL_ERROR_PATTERNS[errorPattern]).toBe(expectedCode);
    });

    it('should map insufficient fee error correctly', () => {
      const errorPattern = 'insufficient fee';
      const expectedCode = BROADCAST_ERROR_CODES.INSUFFICIENT_FEE;

      expect(MEMPOOL_ERROR_PATTERNS[errorPattern]).toBe(expectedCode);
    });

    it('should map already in mempool error correctly', () => {
      const errorPattern = 'already in mempool';
      const expectedCode = BROADCAST_ERROR_CODES.ALREADY_IN_MEMPOOL;

      expect(MEMPOOL_ERROR_PATTERNS[errorPattern]).toBe(expectedCode);
    });
  });

  describe('ERROR_CODE_MESSAGES', () => {
    it('should have user-friendly message for RBF error', () => {
      const code = BROADCAST_ERROR_CODES.INSUFFICIENT_FEE_FOR_REPLACEMENT;
      const message = ERROR_CODE_MESSAGES[code];

      expect(message).toContain('RBF rejected');
      expect(message).toContain('pending transactions');
    });

    it('should have user-friendly message for min relay fee error', () => {
      const code = BROADCAST_ERROR_CODES.MIN_RELAY_FEE_NOT_MET;
      const message = ERROR_CODE_MESSAGES[code];

      expect(message).toContain('fee rate is too low');
      expect(message).toContain('increase the fee rate');
    });

    it('should have user-friendly message for mempool min fee error', () => {
      const code = BROADCAST_ERROR_CODES.MEMPOOL_MIN_FEE_NOT_MET;
      const message = ERROR_CODE_MESSAGES[code];

      expect(message).toContain('below the current mempool minimum');
      expect(message).toContain('network is congested');
    });

    it('should have user-friendly message for insufficient fee error', () => {
      const code = BROADCAST_ERROR_CODES.INSUFFICIENT_FEE;
      const message = ERROR_CODE_MESSAGES[code];

      expect(message).toContain('fee is insufficient');
      expect(message).toContain('increase the fee rate');
    });

    it('should have user-friendly message for mempool duplicate error', () => {
      const code = BROADCAST_ERROR_CODES.ALREADY_IN_MEMPOOL;
      const message = ERROR_CODE_MESSAGES[code];

      expect(message).toContain('already exists in mempool');
      expect(message).toContain('wait for confirmation');
    });

    it('should have fallback message for generic broadcast error', () => {
      const code = BROADCAST_ERROR_CODES.BROADCAST_FAILED;
      const message = ERROR_CODE_MESSAGES[code];

      expect(message).toBe('Transaction broadcast failed.');
    });
  });
});
