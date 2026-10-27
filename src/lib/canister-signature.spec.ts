import { describe, it, expect } from 'vitest';

import { CANISTER_SIGNATURE_MAX_AGE_MS, canisterSignatureCutoff } from './canister-signature';

describe('canister signature deadline', () => {
  it('stays well below the canister 2h pending window', () => {
    expect(CANISTER_SIGNATURE_MAX_AGE_MS).toBe(30 * 60 * 1000);
    expect(CANISTER_SIGNATURE_MAX_AGE_MS).toBeLessThan(2 * 60 * 60 * 1000);
  });

  it('puts the cutoff the max age before now', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(canisterSignatureCutoff(now)).toEqual(new Date(now - CANISTER_SIGNATURE_MAX_AGE_MS));
  });
});
