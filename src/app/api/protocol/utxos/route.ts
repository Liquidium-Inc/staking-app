import { NextResponse } from 'next/server';

import { config } from '@/config/config';
import { canister } from '@/providers/canister';
import { runeProvider } from '@/providers/rune-provider';

export const GET = async () => {
  const outpoints = await runeProvider.mempool.runicUTXOs({ wallet_addr: canister.address });

  return NextResponse.json({ ...outpoints, desiredUtxos: config.protocol.desiredUtxos });
};
