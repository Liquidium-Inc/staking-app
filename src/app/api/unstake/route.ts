import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { config } from '@/config/config';
import { config as publicConfig } from '@/config/public';
import { db } from '@/db';
import { logger } from '@/lib/logger';
import { canister } from '@/providers/canister';
import { redis } from '@/providers/redis';
import { PSBTService } from '@/services/psbt';

bitcoin.initEccLib(ecc);

const body = z.object({
  sender: z.object({
    public: z.string(),
    address: z.string(),
  }),
  amount: z.string().regex(/^\d+$/).transform(BigInt),
  sAmount: z.string().regex(/^\d+$/).transform(BigInt),
  feeRate: z.number().min(0).optional(),
  payer: z
    .object({
      public: z.string(),
      address: z.string(),
    })
    .optional(),
});
export type Body = z.infer<typeof body>;

export const POST = async (req: NextRequest) => {
  try {
    const { success, data, error } = body.safeParse(await req.json());

    if (!success) return NextResponse.json({ error: error.flatten() }, { status: 400 });
    const { sender, payer = sender, amount, sAmount, feeRate } = data;

    const allowedUtxos = await canister.getUnstakeUtxos();

    const psbtService = new PSBTService(
      { ...sender, rune_id: publicConfig.sRune.id, amount: sAmount, retention: canister.retention },
      {
        address: canister.address,
        rune_id: publicConfig.rune.id,
        amount: amount,
        desiredUtxos: config.protocol.desiredUtxos,
        allowedUtxos: allowedUtxos.map((item) => item.utxo),
      },
      payer,
      canister.network,
      feeRate,
    );
    const { psbt: unsignedPsbt, toSign, feeRate: finalFeeRate } = await psbtService.build();

    // Get canister signature for the unsigned PSBT
    const canisterResponse = await canister.unstake(unsignedPsbt);
    if (canisterResponse.error) {
      logger.error('Canister unstake failed', { error: canisterResponse.error });

      // Unlock UTXOs that were locked during PSBT building
      const tempPsbt = bitcoin.Psbt.fromBase64(unsignedPsbt);
      const utxos = tempPsbt.txInputs.map((input) => {
        const txid = Buffer.from(input.hash).reverse().toString('hex');
        return `${txid}:${input.index}`;
      });

      try {
        await redis.utxo.free(utxos, sender.address);
        logger.debug(`Unlocked ${utxos.length} UTXOs after canister unstake failure`);
      } catch (unlockError) {
        logger.warn('Failed to unlock UTXOs after canister failure', { error: unlockError });
      }

      return NextResponse.json({ error: canisterResponse.error }, { status: 400 });
    }

    // Create a temporary transaction ID for tracking (will be replaced with actual txid on confirm)
    const psbt = bitcoin.Psbt.fromBase64(canisterResponse.signed_psbt);
    const tempTxid = (
      psbt.data.globalMap.unsignedTx as unknown as { tx: { getId(): string } }
    ).tx.getId();

    // Check if transaction already exists to prevent duplicates
    const existingUnstake = await db.unstake.getByTxid(tempTxid);
    if (existingUnstake) {
      logger.debug('Unstake transaction already exists', { tempTxid });
      return NextResponse.json({
        psbt: unsignedPsbt,
        toSign,
        feeRate: finalFeeRate,
      });
    }

    // Save canister-signed PSBT to database (psbt column stores the canister signature)
    await db.unstake.insert({
      address: sender.address,
      amount: amount.toString(),
      sAmount: sAmount.toString(),
      txid: tempTxid,
      psbt: canisterResponse.signed_psbt,
      block: null,
    });

    return NextResponse.json({
      psbt: unsignedPsbt,
      toSign,
      feeRate: finalFeeRate,
    });
  } catch (error) {
    logger.error(error as Error);
    if (error instanceof PSBTService.NotEnoughBalanceError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof PSBTService.NotEnoughLiquidityError)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
};
