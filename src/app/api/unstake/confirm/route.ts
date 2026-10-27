import * as ecc from '@bitcoinerlab/secp256k1';
import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { addressesMatch } from '@/lib/address';
import { logger } from '@/lib/logger';
import { captureServerException } from '@/lib/posthog-server-capture';
import { TelemetryScope } from '@/lib/telemetry';
import { canister } from '@/providers/canister';
import { requireSession, UnauthorizedError } from '@/server/auth/session';
import { broadcastWithStoredSignature } from '@/server/transactions/stored-signature';
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
    const unstakeEntry = await db.unstake.getByPrepareTxid(tempTxid);
    if (!unstakeEntry) {
      return NextResponse.json(
        { error: 'Unstake entry not found or missing canister signature' },
        { status: 404 },
      );
    }

    if (!addressesMatch(session.address, unstakeEntry.address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return await broadcastWithStoredSignature('unstake', unstakeEntry, userSignedPsbt);
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
