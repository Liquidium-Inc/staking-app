import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { runeProvider } from '@/providers/rune-provider';

export async function mempoolBalances(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const rune_id = searchParams.get('tokenId');

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  const { data: utxos } = await runeProvider.mempool.runicUTXOs({ wallet_addr: address });

  const balances = utxos.reduce(
    (acc, utxo) => {
      if (Array.isArray(utxo.rune_ids) && Array.isArray(utxo.amounts)) {
        // Validate array lengths match
        if (utxo.rune_ids.length !== utxo.amounts.length) {
          logger.warn('Mismatched rune_ids and amounts arrays for UTXO:', {
            rune_ids_length: utxo.rune_ids.length,
            amounts_length: utxo.amounts.length,
          });
          return acc;
        }

        utxo.rune_ids.forEach((rune_id, i) => {
          try {
            acc[rune_id] ??= BigInt(0);
            acc[rune_id] += BigInt(utxo.amounts[i]);
          } catch (error) {
            logger.warn('Invalid amount format for rune:', {
              rune_id,
              amount: utxo.amounts[i],
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      }
      return acc;
    },
    {} as Record<string, bigint>,
  );

  if (rune_id) {
    const balance = balances[rune_id];
    if (!balance) {
      return NextResponse.json({ rune_id, total_balance: '0' });
    }
    return NextResponse.json({ rune_id, total_balance: balance.toString() });
  }

  return NextResponse.json(
    Object.entries(balances).map(([rune_id, total_balance]) => ({
      rune_id,
      total_balance: total_balance.toString(),
    })),
  );
}
