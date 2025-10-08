import * as ecc from '@bitcoinerlab/secp256k1';
import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';

import { config as runtimeConfig } from '@/config/config';
import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import {
  BROADCAST_ERROR_CODES,
  MEMPOOL_ERROR_PATTERNS,
  formatBroadcastErrorMessage,
} from '@/lib/error-codes';
import { logger } from '@/lib/logger';
import { captureServerException } from '@/lib/posthog-server-capture';
import { TelemetryScope } from '@/lib/telemetry';
import { canister } from '@/providers/canister';
import { mempool } from '@/providers/mempool';
import { redis } from '@/providers/redis';

const inputSchema = z.object({
  sender: z.string(),
  psbt: z.string(),
});

bitcoin.initEccLib(ecc);

const withdrawTime = publicConfig.protocol.withdrawTime;

export async function POST(req: NextRequest) {
  let captured = false;
  let sender: string | undefined;
  let unstakeTxId: string | undefined;
  try {
    const { success, data, error } = inputSchema.safeParse(await req.json());
    if (!success) return NextResponse.json({ error: error.flatten() }, { status: 400 });

    const { psbt: psbtBase64, sender: senderInput } = data;
    sender = senderInput;
    const senderAddress = senderInput;
    let psbt: bitcoin.Psbt;
    try {
      psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: canister.network });
    } catch (error) {
      logger.warn('Invalid PSBT in withdraw confirm', { error });
      return NextResponse.json({ error: 'Invalid PSBT' }, { status: 400 });
    }

    const unstakeTxIdResult = getUnstakeTxId(psbt);
    if (unstakeTxIdResult instanceof NextResponse) return unstakeTxIdResult;
    unstakeTxId = unstakeTxIdResult;
    const unstakeTxIdValue = unstakeTxIdResult;

    const unstakeTx = await mempool.transactions.getTx({ txid: unstakeTxIdValue });
    if (!unstakeTx) return NextResponse.json({ error: 'Unstake tx not found' }, { status: 404 });

    if (unstakeTx.vout.every((x) => x.scriptpubkey_address !== senderAddress))
      return NextResponse.json({ error: 'Sender is not the owner of the tx' }, { status: 400 });

    if (unstakeTx.vout.every((x) => x.scriptpubkey_address !== canister.retention))
      return NextResponse.json({ error: 'Unstake tx is not a retention output' }, { status: 400 });

    const status = unstakeTx.status as { confirmed?: boolean; block_time?: number };

    if (!status?.confirmed || typeof status.block_time !== 'number') {
      return NextResponse.json(
        { error: 'Unstake transaction is not yet confirmed' },
        { status: 400 },
      );
    }

    const unlockAt = new Date((status.block_time + withdrawTime) * 1000);
    if (unlockAt > new Date()) {
      return NextResponse.json(
        { error: `Unstake will be available in ${unlockAt.toLocaleString()}` },
        { status: 400 },
      );
    }

    logger.info(`${senderAddress} is trying to withdraw a transaction from ${unstakeTx.txid}`);

    const response = await canister.withdraw?.(psbtBase64);
    if (!response || response.error)
      return NextResponse.json({ error: response.error || 'Withdraw failed' }, { status: 400 });

    const signedPsbt = bitcoin.Psbt.fromBase64(response.signed_psbt);

    // Finalize the signed PSBT before extracting transaction
    signedPsbt.txInputs.forEach((_, index) => {
      try {
        signedPsbt.finalizeInput(index);
      } catch (error) {
        logger.warn('Could not finalize input ', error);
      }
    });

    const entry = await db.unstake.getByTxid(unstakeTx.txid);
    if (!entry) return NextResponse.json({ error: 'Unstake not found' }, { status: 400 });

    const tx = signedPsbt.extractTransaction();
    const feeRate = signedPsbt.getFeeRate();

    logger.info(`broadcasting tx with fee ${feeRate} sat/vbyte`);
    try {
      await mempool.transactions.postTx({ txhex: tx.toHex() });

      // Lock UTXOs for 5 minutes after successful broadcast to prevent double-spending
      const utxos = signedPsbt.txInputs.map((input) => {
        const txid = Buffer.from(input.hash).reverse().toString('hex');
        return `${txid}:${input.index}`;
      });
      logger.debug(`locking ${utxos.length} UTXOs for 5 minutes after broadcast`);
      for (const utxo of utxos) {
        await redis.utxo.lock(utxo, sender, 300); // 300 seconds = 5 minutes
      }
    } catch (e) {
      // Collect upstream axios response details
      const axiosResponse = (
        e as { response?: { status?: number; data?: unknown; headers?: Record<string, unknown> } }
      ).response;
      const rawData = axiosResponse?.data;
      const errorDataStr = stringifyErrorData(rawData);
      const truncatedData = errorDataStr ? errorDataStr.slice(0, 2000) : undefined;

      // Map known mempool error patterns to friendly messages (case-insensitive)
      const lowerError = errorDataStr?.toLowerCase();
      const matchedPattern = lowerError
        ? Object.keys(MEMPOOL_ERROR_PATTERNS).find((pattern) =>
            lowerError.includes(pattern.toLowerCase()),
          )
        : undefined;
      const mappedCode = matchedPattern
        ? MEMPOOL_ERROR_PATTERNS[matchedPattern as keyof typeof MEMPOOL_ERROR_PATTERNS]
        : undefined;

      // Capture with rich context for better debugging
      await captureServerException(req, e as Error, {
        scope: TelemetryScope.WithdrawConfirm,
        txid: tx.getId(),
        endpoint: 'mempool.transactions.postTx',
        mempoolHost: runtimeConfig.mempool.host,
        feeRate,
        responseStatus: axiosResponse?.status,
        responseData: truncatedData,
        matchedPattern,
        mappedCode,
        unstakeTxId,
        sender,
      });
      captured = true;

      logger.error('Withdraw broadcast rejected', {
        status: axiosResponse?.status,
        matchedPattern,
        mappedCode,
        feeRate,
        txid: tx.getId(),
        mempoolHost: runtimeConfig.mempool.host,
        responseDataPreview: truncatedData,
      });

      // Return mapped or generic error to client
      if (mappedCode && errorDataStr) {
        const message = formatBroadcastErrorMessage(mappedCode, errorDataStr);
        return NextResponse.json<{ error: string; code?: string }>(
          { error: message, code: mappedCode },
          { status: 400 },
        );
      }
      if (errorDataStr) {
        return NextResponse.json<{ error: string; code?: string }>(
          {
            error: `Transaction broadcast failed: ${errorDataStr}`,
            code: BROADCAST_ERROR_CODES.BROADCAST_FAILED,
          },
          { status: 400 },
        );
      }
      const fallbackMessage = (e as Error).message || 'Unknown error';
      return NextResponse.json<{ error: string; code?: string }>(
        {
          error: `Transaction broadcast failed: ${fallbackMessage}`,
          code: BROADCAST_ERROR_CODES.BROADCAST_FAILED,
        },
        { status: 400 },
      );
    }

    logger.debug(`updating transaction ${tx.getId()} into db`);
    await db.unstake.update([entry.id], { claimTx: tx.getId() });

    return NextResponse.json({
      fee: signedPsbt.getFee() + '',
      feeRate,
      psbt: signedPsbt.toBase64(),
      tx: tx.toHex(),
      txid: tx.getId(),
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (!captured) {
        const respStatus = error.response?.status;
        const respDataRaw = error.response?.data as unknown;
        const respDataStr = stringifyErrorData(respDataRaw);
        await captureServerException(req, error as Error, {
          scope: TelemetryScope.WithdrawConfirm,
          responseStatus: respStatus,
          responseData: respDataStr ? respDataStr.slice(0, 2000) : undefined,
          unstakeTxId,
          sender,
        });
      }
      logger.error('Axios error in withdraw confirm', {
        status: error.response?.status,
        body: stringifyErrorData(error.response?.data) ?? error.message,
        unstakeTxId,
        sender,
      });
      return NextResponse.json(
        { error: stringifyErrorData(error.response?.data) ?? error.message },
        { status: error.response?.status ?? 500 },
      );
    }
    if (error instanceof NextResponse) {
      return error as NextResponse<{ error: string }>;
    }
    await captureServerException(req, error as Error, {
      scope: TelemetryScope.WithdrawConfirm,
      unstakeTxId,
      sender,
    });
    logger.error(error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function getUnstakeTxId(psbt: bitcoin.Psbt) {
  const retentionOutputs = psbt.txInputs.filter((_, i) => {
    const script = psbt.data.inputs[i].witnessUtxo?.script;
    if (!script) return false;
    return bitcoin.address.fromOutputScript(script, canister.network) === canister.retention;
  });

  if (retentionOutputs.length !== 1)
    return NextResponse.json(
      { error: `Expected one retention output, got ${retentionOutputs.length}` },
      { status: 400 },
    );
  return Buffer.from(retentionOutputs[0].hash.toReversed()).toString('hex');
}

function stringifyErrorData(data: unknown): string | undefined {
  if (!data) return undefined;
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer).toString('utf8');
  try {
    return JSON.stringify(data);
  } catch {
    try {
      return String(data);
    } catch {
      return undefined;
    }
  }
}
