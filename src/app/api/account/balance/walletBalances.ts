import { NextResponse } from 'next/server';

import { pick } from '@/lib/pick';
import { runeProvider } from '@/providers/rune-provider';

export async function walletBalances(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const rune_id = searchParams.get('tokenId');

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  const { data: balance } = await runeProvider.runes.walletBalances({ address });

  if (rune_id) {
    const token = balance.find((token) => token.rune_id === rune_id);
    if (!token) {
      return NextResponse.json({ rune_id, total_balance: '0' });
    }
    return NextResponse.json(pick(token, 'rune_id', 'total_balance'));
  }

  return NextResponse.json(balance.map((e) => pick(e, 'rune_id', 'total_balance')));
}
