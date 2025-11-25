import * as ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { addressesMatch } from '@/lib/address';
import { logger } from '@/lib/logger';
import { RunePSBT } from '@/lib/psbt';
import { canister } from '@/providers/canister';
import { mempool } from '@/providers/mempool';
import { runeProvider } from '@/providers/rune-provider';
import { requireSession, UnauthorizedError } from '@/server/auth/session';

bitcoin.initEccLib(ecc);

const body = z.object({
  txid: z.string(),
  sender: z.object({ public: z.string(), address: z.string() }),
  feeRate: z.number().min(0).optional(),
  payer: z.object({ public: z.string(), address: z.string() }).optional(),
});

export const POST = async (req: NextRequest) => {
  try {
    const session = await requireSession(req);

    const { success, data, error } = body.safeParse(await req.json());

    if (!success) return NextResponse.json({ error: error.flatten() }, { status: 400 });

    const { txid, sender, payer = sender } = data;
    const { feeRate = (await mempool.fees.getFeesRecommended()).fastestFee + 1 } = data;

    if (!addressesMatch(session.address, sender.address)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const outpoints = await getPayerUTXOs(payer);

    const tx = await mempool.transactions.getTx({ txid });
    if (tx.vout.every((x) => x.scriptpubkey_address !== sender.address))
      return NextResponse.json({ error: 'Sender is not the owner of the tx' }, { status: 400 });

    const utxos = tx.vout
      .map((e, index) => ({ ...e, index }))
      .filter((x) => x.scriptpubkey_address === canister.retention);

    if (utxos.length === 0) return NextResponse.json({ error: 'No UTXOs found' }, { status: 400 });

    // Get rune balances for the retention UTXOs
    const withdrawnRunes: Record<string, bigint> = {};
    const utxoRuneData: Record<string, Record<string, bigint>> = {};
    try {
      const retentionRuneBalances = await runeProvider.mempool.runicUTXOs({
        wallet_addr: canister.retention,
      });

      // Find the specific UTXO rune data and track per UTXO
      for (const utxo of utxos) {
        const utxoKey = `${txid}:${utxo.index}`;
        utxoRuneData[utxoKey] = {};

        const runicUtxo = retentionRuneBalances.data.find(
          (ru) => ru.txid === txid && ru.vout === utxo.index,
        );

        if (runicUtxo && Array.isArray(runicUtxo.rune_ids) && Array.isArray(runicUtxo.amounts)) {
          // Validate array lengths match
          if (runicUtxo.rune_ids.length !== runicUtxo.amounts.length) {
            logger.warn('Mismatched rune_ids and amounts arrays for UTXO:', {
              txid,
              vout: utxo.index,
              rune_ids_length: runicUtxo.rune_ids.length,
              amounts_length: runicUtxo.amounts.length,
            });
            continue;
          }

          for (let i = 0; i < runicUtxo.rune_ids.length; i++) {
            const runeId = runicUtxo.rune_ids[i];
            try {
              const amount = BigInt(runicUtxo.amounts[i]);
              utxoRuneData[utxoKey][runeId] = amount;
              withdrawnRunes[runeId] = (withdrawnRunes[runeId] || BigInt(0)) + amount;
            } catch (error) {
              logger.warn('Invalid amount format for rune:', {
                runeId,
                amount: runicUtxo.amounts[i],
                error: error instanceof Error ? error.message : String(error),
              });
              continue;
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch rune balances, falling back to pointer-only:', error);
      // Continue with empty runes object, will fall back to pointer-only behavior
    }

    const runePsbt = new RunePSBT(canister.network).setPayer(...outpoints);

    runePsbt.addInput(
      ...utxos.map((x) => {
        const utxoKey = `${txid}:${x.index}`;
        return {
          hash: txid,
          index: x.index,
          address: canister.retention,
          publicKey: '',
          value: BigInt(x.value),
          runes: utxoRuneData[utxoKey] || {},
        };
      }),
    );

    // Add output with explicit rune amounts for edicts
    runePsbt.addOutput({
      isPointer: true,
      address: sender.address,
      runes: withdrawnRunes,
    });

    const psbt = await runePsbt.build(feeRate);

    const toSign = runePsbt.inputs
      .map((x, i) => ({ index: i, address: x.address }))
      .filter((x) => [sender.address, payer.address].includes(x.address));

    return NextResponse.json({
      sender,
      payer,
      feeRate,
      psbt: psbt.toBase64(),
      toSign,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    logger.error(error as Error);
    if (error instanceof Error && error.message === 'Insufficient balance') {
      return NextResponse.json({ error: 'Not enough balance to pay fees' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
};

const getPayerUTXOs = async (payer: { address: string; public: string }) => {
  const response = await runeProvider.mempool.cardinalUTXOs({ wallet_addr: payer.address });
  const outpoints = response.data
    .map((utxo) => ({
      hash: utxo.txid,
      index: utxo.vout,
      value: BigInt(utxo.value),
      address: utxo.address,
      publicKey: payer.public,
      runes: {},
    }))
    .sort((a, b) => Number(a.value - b.value));
  return outpoints;
};
