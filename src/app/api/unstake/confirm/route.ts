import * as ecc from '@bitcoinerlab/secp256k1';
import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { addressesMatch } from '@/lib/address';
import { canisterSignatureCutoff } from '@/lib/canister-signature';
import { logger } from '@/lib/logger';
import { captureServerException } from '@/lib/posthog-server-capture';
import { TelemetryScope } from '@/lib/telemetry';
import {
  ALREADY_SUBMITTED_ERROR_MESSAGE,
  SIGNATURE_EXPIRED_ERROR_MESSAGE,
  signatureExpiredErrorResponseSchema,
  TransactionErrorCode,
} from '@/lib/transaction-errors';
import { canister } from '@/providers/canister';
import { requireSession, UnauthorizedError } from '@/server/auth/session';
import { BroadcastService } from '@/services/broadcast';

export const maxDuration = 120;

const inputSchema = z.object({
  psbt: z.string(),
});

bitcoin.initEccLib(ecc);

export async function POST(req: NextRequest) {
  const { success, data, error } = inputSchema.safeParse(await req.json());
  if (!success) return NextResponse.json({ error: error.flatten() }, { status: 400 });

  try {
    const session = await requireSession(req);
    const userSignedPsbt = bitcoin.Psbt.fromBase64(data.psbt, { network: canister.network });

    // Get the temporary transaction ID to find the saved canister signature
    const tempTxid = (
      userSignedPsbt.data.globalMap.unsignedTx as unknown as { tx: { getId(): string } }
    ).tx.getId();

    // Find the unstake entry with the saved canister signature
    const unstakeEntry = await db.unstake.getByTxid(tempTxid);
    if (!unstakeEntry) {
      return NextResponse.json(
        { error: 'Unstake entry not found or missing canister signature' },
        { status: 404 },
      );
    }

    if (!addressesMatch(session.address, unstakeEntry.address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Combine first so a malformed request can't consume the stored signature
    const storedPsbt = unstakeEntry.psbt;
    const combinedPsbt = storedPsbt
      ? bitcoin.Psbt.fromBase64(storedPsbt, { network: canister.network }).combine(userSignedPsbt)
      : undefined;

    // The row is inserted right after the canister signs, so its timestamp is the signing time.
    // Claiming clears the stored PSBT atomically, so at most one request can broadcast it, and
    // only before the deadline.
    const signedAfter = canisterSignatureCutoff();
    const claimed =
      !!storedPsbt && (await db.unstake.claimSignedPsbt(unstakeEntry.id, storedPsbt, signedAfter));

    if (!claimed || !combinedPsbt) {
      const expired =
        !!unstakeEntry.invalidatedAt ||
        (await db.unstake.expireSignedPsbt(unstakeEntry.id, signedAfter));
      if (expired) {
        logger.info('Rejected expired canister signature', { id: unstakeEntry.id, tempTxid });
        return NextResponse.json(
          signatureExpiredErrorResponseSchema.parse({
            error: SIGNATURE_EXPIRED_ERROR_MESSAGE,
            error_code: TransactionErrorCode.SignatureExpired,
          }),
          { status: 410 },
        );
      }
      // Another request already took the signature (in flight or broadcast)
      return NextResponse.json({ error: ALREADY_SUBMITTED_ERROR_MESSAGE }, { status: 409 });
    }

    let result: Awaited<ReturnType<BroadcastService['broadcast']>>;
    try {
      // Use BroadcastService to handle the combined PSBT (skip database insert since we already have the entry)
      const broadcastService = new BroadcastService(combinedPsbt, 'unstake', true);
      result = await broadcastService.broadcast();
    } catch (broadcastError) {
      // Keep the row for history but mark it dead; the user starts over with a fresh signature
      await db.unstake
        .update([unstakeEntry.id], { invalidatedAt: new Date() })
        .catch((invalidateError) =>
          logger.error('Failed to invalidate unstake after broadcast error', {
            id: unstakeEntry.id,
            error: invalidateError,
          }),
        );
      throw broadcastError;
    }

    // The tx is broadcast at this point; a failed bookkeeping update must not fail the request
    try {
      await db.unstake.update([unstakeEntry.id], { txid: result.txid });
    } catch (updateError) {
      logger.error('Failed to record broadcast unstake txid', {
        id: unstakeEntry.id,
        txid: result.txid,
        error: updateError,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (axios.isAxiosError(error)) {
      await captureServerException(req, error);
      logger.error('Axios error in unstake confirm', {
        status: error.response?.status,
        body: error.response?.data ?? error.message,
      });
      return NextResponse.json(
        { error: error.response?.data ?? error.message },
        { status: error.response?.status ?? 500 },
      );
    }
    if (error instanceof BroadcastService.Error) {
      // Capture controlled broadcast errors with txid when available
      if (error instanceof BroadcastService.BroadcastError) {
        await captureServerException(req, error, { scope: TelemetryScope.UnstakeConfirm });
      } else {
        await captureServerException(req, error as Error, { scope: TelemetryScope.UnstakeConfirm });
      }
      const response: { error: string; code?: string } = { error: error.message };

      // Include error code if available (for BroadcastError instances)
      if (error instanceof BroadcastService.BroadcastError && error.code) {
        response.code = error.code;
      }

      return NextResponse.json(response, { status: 400 });
    }
    await captureServerException(req, error as Error, { scope: TelemetryScope.UnstakeConfirm });
    logger.error('Unexpected error in unstake confirm', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
