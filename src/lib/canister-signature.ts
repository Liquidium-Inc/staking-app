/**
 * Maximum age of a canister-signed PSBT before it can no longer be confirmed and broadcast.
 * Must stay well below the canister's own pending-record window (2 hours).
 */
export const CANISTER_SIGNATURE_MAX_AGE_MS = 30 * 60 * 1000;

/** Signatures created before the returned time are expired. */
export function canisterSignatureCutoff(now: number = Date.now()): Date {
  return new Date(now - CANISTER_SIGNATURE_MAX_AGE_MS);
}
