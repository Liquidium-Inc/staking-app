import * as ecc from '@bitcoinerlab/secp256k1';
import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { logger } from '@/lib/logger';
import { captureServerException } from '@/lib/posthog-server-capture';
import { TelemetryScope } from '@/lib/telemetry';
import { canister } from '@/providers/canister';
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
    const userSignedPsbt = bitcoin.Psbt.fromBase64(data.psbt, { network: canister.network });

    // Get the temporary transaction ID to find the saved canister signature
    const tempTxid = (
      userSignedPsbt.data.globalMap.unsignedTx as unknown as { tx: { getId(): string } }
    ).tx.getId();

    // Find the stake entry with the saved canister signature
    const stakeEntry = await db.stake.getByTxid(tempTxid);
    if (!stakeEntry || !stakeEntry.psbt) {
      return NextResponse.json(
        { error: 'Stake entry not found or missing canister signature' },
        { status: 404 },
      );
    }

    // Load the canister-signed PSBT and combine with user signatures
    const canisterSignedPsbt = bitcoin.Psbt.fromBase64(stakeEntry.psbt, {
      network: canister.network,
    });
    const combinedPsbt = canisterSignedPsbt.combine(userSignedPsbt);

    // Use BroadcastService to handle the combined PSBT (skip database insert since we already have the entry)
    const broadcastService = new BroadcastService(combinedPsbt, 'stake', true);

    try {
      const result = await broadcastService.broadcast();

      // Update the database with the actual transaction ID
      await db.stake.update([stakeEntry.id], { txid: result.txid });

      return NextResponse.json(result);
    } catch (broadcastError) {
      // Clean up database entry on broadcast failure
      await db.stake.remove([stakeEntry.id]);
      throw broadcastError;
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      await captureServerException(req, error);
      logger.error('Axios error in stake confirm', {
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
        await captureServerException(req, error, { scope: TelemetryScope.StakeConfirm });
      } else {
        await captureServerException(req, error as Error, { scope: TelemetryScope.StakeConfirm });
      }
      const response: { error: string; code?: string } = { error: error.message };

      // Include error code if available (for BroadcastError instances)
      if (error instanceof BroadcastService.BroadcastError && error.code) {
        response.code = error.code;
      }

      return NextResponse.json(response, { status: 400 });
    }
    await captureServerException(req, error as Error, { scope: TelemetryScope.StakeConfirm });
    logger.error('Unexpected error in stake confirm', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
