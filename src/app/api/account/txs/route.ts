import { NextResponse } from 'next/server';

import { config } from '@/config/public';
import { runeProvider } from '@/providers/rune-provider';

const runeId = config.sRune.id;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  const count = 2000;
  const { data: activity } = await runeProvider.runes.walletActivity({
    address,
    rune_id: runeId,
    count,
  });
  // TODO: Get all pages

  const only_runes = activity.filter((tx) => tx.rune_id === runeId);

  const keys = new Set<string>();
  const deduplicated = only_runes
    .filter((tx) => tx.rune_id === runeId)
    .filter((tx) => {
      const key = `${tx.event_type}:${tx.outpoint}`;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });

  return NextResponse.json(deduplicated);
}
