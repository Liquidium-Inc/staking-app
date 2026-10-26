/**
 * Maximum age of a canister-signed PSBT before it can no longer be confirmed and broadcast.
 * Must stay well below the canister's own pending-record window (2 hours).
 */
export const CANISTER_SIGNATURE_MAX_AGE_MS = 30 * 60 * 1000;

/** Rows without a valid signing timestamp are treated as expired. */
export function isCanisterSignatureExpired(
  signedAt: Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!(signedAt instanceof Date) || Number.isNaN(signedAt.getTime())) return true;
  return now - signedAt.getTime() > CANISTER_SIGNATURE_MAX_AGE_MS;
}
