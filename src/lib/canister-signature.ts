import axios from 'axios';

import { mempool } from '@/providers/mempool';

/**
 * Maximum age of a canister-signed PSBT before it can no longer be confirmed and broadcast.
 * Must stay well below the canister's own pending-record window (2 hours).
 */
export const CANISTER_SIGNATURE_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * After this long, a claim whose request never finished (crash, timeout, lost response) may be
 * reconciled. Must exceed the confirm routes' maxDuration (120s).
 */
export const CANISTER_CLAIM_STALE_MS = 5 * 60 * 1000;

/** Signatures created before the returned time are expired. */
export function canisterSignatureCutoff(now: number = Date.now()): Date {
  return new Date(now - CANISTER_SIGNATURE_MAX_AGE_MS);
}

/** Claims made before the returned time are stale. */
export function canisterClaimStaleBefore(now: number = Date.now()): Date {
  return new Date(now - CANISTER_CLAIM_STALE_MS);
}

/** Whether the tx is in the mempool or on-chain. Throws if the lookup itself fails. */
export async function isTxKnown(txid: string): Promise<boolean> {
  try {
    await mempool.transactions.getTxStatus({ txid });
    return true;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return false;
    throw error;
  }
}
