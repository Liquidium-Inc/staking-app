import { NextResponse } from 'next/server';
import { z } from 'zod';

import { config } from '@/config/public';
import { runeProvider } from '@/providers/rune-provider';

const PORTFOLIO_ACTIVITY_HISTORY_COUNT = 5000;
const runeId = config.sRune.id;

const WalletActivitySchema = z.object({
  event_type: z.enum(['output', 'input']),
  outpoint: z.string().min(1),
  amount: z.string().min(1),
  timestamp: z.string().min(1),
  rune_id: z.string().min(1),
  decimals: z.number().int().nonnegative(),
});

const PortfolioActivityResponseSchema = z.object({
  activity: z.array(WalletActivitySchema),
  truncated: z.boolean(),
  originalFetchCount: z.number(),
  deduplicatedCount: z.number(),
});

type PortfolioActivityResponse = z.infer<typeof PortfolioActivityResponseSchema>;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  const { data: activity } = await runeProvider.runes.walletActivity({
    address,
    rune_id: runeId,
    // Keep the portfolio response bounded so page load time does not scale with the full wallet history.
    count: PORTFOLIO_ACTIVITY_HISTORY_COUNT,
  });

  const only_runes = activity.filter((tx) => tx.rune_id === runeId);

  const keys = new Set<string>();
  const deduplicated = only_runes.filter((tx) => {
    const key = `${tx.event_type}:${tx.outpoint}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });

  const result = PortfolioActivityResponseSchema.parse({
    activity: deduplicated,
    truncated: activity.length === PORTFOLIO_ACTIVITY_HISTORY_COUNT,
    originalFetchCount: activity.length,
    deduplicatedCount: deduplicated.length,
  });

  return NextResponse.json<PortfolioActivityResponse>(result);
}
