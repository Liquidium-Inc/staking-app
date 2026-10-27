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
type Entry = NonNullable<Awaited<ReturnType<(typeof db)['stake']['getByPrepareTxid']>>>;

export const alreadySubmittedResponse = () =>
  NextResponse.json(
    alreadySubmittedErrorResponseSchema.parse({
      error: ALREADY_SUBMITTED_ERROR_MESSAGE,
      error_code: TransactionErrorCode.AlreadySubmitted,
    }),
    { status: 409 },
  );

const expiredResponse = () =>
  NextResponse.json(
    signatureExpiredErrorResponseSchema.parse({
      error: SIGNATURE_EXPIRED_ERROR_MESSAGE,
      error_code: TransactionErrorCode.SignatureExpired,
    }),
    { status: 410 },
  );

/** Whether the row holds a stored signature that a confirm request could still claim. */
const hasUsableSignature = (row: Entry | undefined) =>
  !!row?.psbt &&
  !row.invalidatedAt &&
  row.block === null &&
  !!row.timestamp &&
  row.timestamp >= canisterSignatureCutoff();

/**
 * Prepare found an existing row for the same unsigned tx. Re-arms it with the fresh canister
 * signature when that is safe and returns null (hand out the PSBT), otherwise releases the
 * caller's UTXO locks and returns a 409. Never re-arms a tx that was handed to the network.
 */
export async function reuseExistingEntry(
  kind: Kind,
  existing: Entry,
  signedPsbt: string,
  releaseLocks: () => Promise<unknown>,
) {
  const table = db[kind];
  try {
    const reachedNetwork =
      existing.block !== null ||
      existing.broadcastAt !== null ||
      (existing.claimedAt !== null && (await isTxKnown(existing.txid)));
    if (reachedNetwork && existing.invalidatedAt) {
      await table.update([existing.id], { invalidatedAt: null });
    }
    const usable =
      !reachedNetwork &&
      ((await table.refreshSignedPsbt(
        existing.id,
        signedPsbt,
        canisterSignatureCutoff(),
        canisterClaimStaleBefore(),
      )) ||
        hasUsableSignature(await table.getByPrepareTxid(existing.prepareTxid!)));
    if (usable) return null;
  } catch (error) {
    await releaseLocks();
    throw error;
  }
  await releaseLocks();
  return alreadySubmittedResponse();
}

/**
 * Combines the user's signatures with the stored canister signature and broadcasts the tx.
 * The stored PSBT is claimed atomically first, so at most one request broadcasts it, and only
 * before the signing deadline. Broadcast errors are rethrown for the route to map.
 */
export async function broadcastWithStoredSignature(
  kind: Kind,
  entry: Entry,
  userSignedPsbt: bitcoin.Psbt,
  retryClaim = true,
): Promise<NextResponse> {
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
  const row = await table.getByPrepareTxid(entry.prepareTxid!);
  if (!row || row.block !== null) return alreadySubmittedResponse();
  // A concurrent prepare stored a fresh signature for the same tx: claim that one instead
  if (retryClaim && row.psbt !== storedPsbt && hasUsableSignature(row)) {
    return broadcastWithStoredSignature(kind, row, userSignedPsbt, false);
  }
  if (row.invalidatedAt) return expiredResponse();
  if (row.psbt) {
    if (await table.expireSignedPsbt(row.id, canisterSignatureCutoff())) {
      logger.info(`Rejected expired canister signature for ${kind}`, { id: row.id });
      return expiredResponse();
    }
    return alreadySubmittedResponse();
  }

  // Claimed by another request. If that request died long ago without the tx reaching the
  // network, release the row so the user can start again.
  if (!row.broadcastAt && row.claimedAt && row.claimedAt < canisterClaimStaleBefore()) {
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
  // The final txid (differs from the unsigned one for P2SH inputs). It is persisted together with
  // the send attempt right before broadcasting, so from then on the claim is never released.
  let networkTxid: string | undefined;
  const recordNetworkTxid = async (txid: string) => {
    if (!(await table.recordBroadcastTxid(entry.id, claimedAt, txid))) {
      throw new BroadcastService.BroadcastError('Transaction claim was lost');
    }
    networkTxid = txid;
  };

  try {
    // Skip the database insert since the entry already exists
    return NextResponse.json(
      await new BroadcastService(combinedPsbt, kind, true, recordNetworkTxid).broadcast(),
    );
  } catch (broadcastError) {
    if (!networkTxid) {
      // Never handed to the network: the claim is dead and the user can start again
      await table
        .invalidateClaim(entry.id, claimedAt)
        .catch((invalidateError) =>
          logger.error(`Failed to invalidate ${kind} claim`, { id: entry.id, invalidateError }),
        );
      throw broadcastError;
    }
    // Sent: a failed or lost response doesn't mean the tx didn't reach the network. The claim
    // stays (the monitor settles or gives it up); answer success if the network already has it.
    const known = await isTxKnown(networkTxid).catch((lookupError) => {
      logger.error(`Could not check ${kind} tx after broadcast error`, {
        txid: networkTxid,
        lookupError,
      });
      return null;
    });
    if (known) {
      logger.warn(`${kind} broadcast reported an error but the tx is known`, { txid: networkTxid });
      return NextResponse.json({ txid: networkTxid });
    }
    // The node refused it outright and nobody else holds the signed tx: the send didn't happen
    if (
      known === false &&
      broadcastError instanceof BroadcastService.BroadcastError &&
      broadcastError.rejectedByNode
    ) {
      await table
        .releaseRejectedSend(entry.id, claimedAt)
        .catch((releaseError) =>
          logger.error(`Failed to release rejected ${kind} send`, { id: entry.id, releaseError }),
        );
    }
    throw broadcastError;
  }
}
