import { describe, it, expect } from 'vitest';

import { CANISTER_SIGNATURE_MAX_AGE_MS, isCanisterSignatureExpired } from './canister-signature';

describe('isCanisterSignatureExpired', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it('stays well below the canister 2h pending window', () => {
    expect(CANISTER_SIGNATURE_MAX_AGE_MS).toBe(30 * 60 * 1000);
    expect(CANISTER_SIGNATURE_MAX_AGE_MS).toBeLessThan(2 * 60 * 60 * 1000);
  });

  it('accepts signatures within the deadline', () => {
    expect(isCanisterSignatureExpired(new Date(now), now)).toBe(false);
    expect(isCanisterSignatureExpired(new Date(now - CANISTER_SIGNATURE_MAX_AGE_MS), now)).toBe(
      false,
    );
  });

  it('rejects signatures past the deadline', () => {
    expect(isCanisterSignatureExpired(new Date(now - CANISTER_SIGNATURE_MAX_AGE_MS - 1), now)).toBe(
      true,
    );
  });

  it('rejects missing or invalid timestamps', () => {
    expect(isCanisterSignatureExpired(null, now)).toBe(true);
    expect(isCanisterSignatureExpired(undefined, now)).toBe(true);
    expect(isCanisterSignatureExpired(new Date('invalid'), now)).toBe(true);
  });
});
