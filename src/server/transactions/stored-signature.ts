import * as bitcoin from 'bitcoinjs-lib';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  canisterClaimStaleBefore,
  canisterSignatureCutoff,
  isTxKnown,
} from '@/lib/canister-signature';
import { logger } from '@/lib/logger';
import {
  ALREADY_SUBMITTED_ERROR_MESSAGE,
  alreadySubmittedErrorResponseSchema,
  SIGNATURE_EXPIRED_ERROR_MESSAGE,
  signatureExpiredErrorResponseSchema,
  TransactionErrorCode,
} from '@/lib/transaction-errors';
import { canister } from '@/providers/canister';
import { BroadcastService } from '@/services/broadcast';

type Kind = 'stake' | 'unstake';
type Entry = NonNullable<Awaited<ReturnType<(typeof db)['stake']['getByTxid']>>>;

export const alreadySubmittedResponse = () =>
  NextResponse.json(
    alreadySubmittedErrorResponseSchema.parse({
      error: ALREADY_SUBMITTED_ERROR_MESSAGE,
      error_code: TransactionErrorCode.AlreadySubmitted,
    }),
    { status: 409 },
  );

/** Whether the row holds a stored signature that a confirm request could still claim. */
export const hasUsableSignature = (row: Entry | undefined) =>
  !!row?.psbt &&
  !row.invalidatedAt &&
  row.block === null &&
  !!row.timestamp &&
  row.timestamp >= canisterSignatureCutoff();

const expiredResponse = () =>
  NextResponse.json(
    signatureExpiredErrorResponseSchema.parse({
      error: SIGNATURE_EXPIRED_ERROR_MESSAGE,
      error_code: TransactionErrorCode.SignatureExpired,
    }),
    { status: 410 },
  );

/**
 * Combines the user's signatures with the stored canister signature and broadcasts the tx.
 * The stored PSBT is claimed atomically first, so at most one request broadcasts it, and only
 * before the signing deadline. Broadcast errors are rethrown for the route to map.
 */
export async function broadcastWithStoredSignature(
  kind: Kind,
  entry: Entry,
  userSignedPsbt: bitcoin.Psbt,
  tempTxid: string,
) {
  const table = db[kind];
  const storedPsbt = entry.psbt;
  if (storedPsbt && entry.block === null) {
    // Combine first so a malformed request can't consume the stored signature
    const combinedPsbt = bitcoin.Psbt.fromBase64(storedPsbt, { network: canister.network }).combine(
      userSignedPsbt,
    );
    const claimedAt = await table.claimSignedPsbt(entry.id, storedPsbt, canisterSignatureCutoff());
    if (claimedAt) return broadcastClaimed(kind, entry, combinedPsbt, claimedAt);
  }

  // Not claimable: work out why from the current row
  const row = await table.getByTxid(tempTxid);
  if (!row || row.block !== null) return alreadySubmittedResponse();
  if (row.invalidatedAt) return expiredResponse();
  if (row.psbt) {
    await table.expireSignedPsbt(row.id, canisterSignatureCutoff());
    logger.info(`Rejected expired canister signature for ${kind}`, { id: row.id, tempTxid });
    return expiredResponse();
  }

  // Claimed by another request. If that request died long ago without the tx reaching the
  // network, release the row so the user can start again.
  if (row.claimedAt && row.claimedAt < canisterClaimStaleBefore()) {
    if (await isTxKnown(row.txid)) return alreadySubmittedResponse();
    if (await table.invalidateClaim(row.id, row.claimedAt)) {
      logger.warn(`Released stale ${kind} claim`, { id: row.id, txid: row.txid });
      return expiredResponse();
    }
  }
  return alreadySubmittedResponse();
}

async function broadcastClaimed(
  kind: Kind,
  entry: Entry,
  combinedPsbt: bitcoin.Psbt,
  claimedAt: Date,
) {
  const table = db[kind];
  let result: Awaited<ReturnType<BroadcastService['broadcast']>>;
  try {
    // Skip the database insert since the entry already exists
    result = await new BroadcastService(combinedPsbt, kind, true).broadcast();
  } catch (broadcastError) {
    const txid =
      (broadcastError instanceof BroadcastService.BroadcastError && broadcastError.txid) ||
      entry.txid;
    // A failed or lost response doesn't mean the tx didn't reach the network
    const known = await isTxKnown(txid).catch((lookupError) => {
      logger.error(`Could not check ${kind} tx after broadcast error`, { txid, lookupError });
      return undefined;
    });
    if (known) {
      logger.warn(`${kind} broadcast reported an error but the tx is known`, { txid });
      await recordTxid(kind, entry.id, txid);
      return NextResponse.json({ txid });
    }
    // Unknown lookup result: leave the claim; it is reconciled once stale
    if (known === false) {
      await table
        .invalidateClaim(entry.id, claimedAt, txid)
        .catch((invalidateError) =>
          logger.error(`Failed to invalidate ${kind} claim`, { id: entry.id, invalidateError }),
        );
    }
    throw broadcastError;
  }

  await recordTxid(kind, entry.id, result.txid);
  return NextResponse.json(result);
}

// The tx is on the network at this point; a failed bookkeeping update must not fail the request
async function recordTxid(kind: Kind, id: number, txid: string) {
  try {
    await db[kind].update([id], { txid });
  } catch (updateError) {
    logger.error(`Failed to record broadcast ${kind} txid`, { id, txid, updateError });
  }
}
