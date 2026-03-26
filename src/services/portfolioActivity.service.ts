import { z } from 'zod';

import { type RuneProvider } from '@/providers/rune-provider';

export const WalletActivitySchema = z.object({
  event_type: z.enum(['output', 'input']),
  outpoint: z.string().min(1),
  amount: z.string().min(1),
  timestamp: z.string().min(1),
  rune_id: z.string().min(1),
  decimals: z.number().int().nonnegative(),
});

export const PortfolioActivityResponseSchema = z.object({
  activity: z.array(WalletActivitySchema),
  truncated: z.boolean(),
  originalFetchCount: z.number(),
  deduplicatedCount: z.number(),
});

export type PortfolioActivityResponse = z.infer<typeof PortfolioActivityResponseSchema>;

/**
 * Loads bounded portfolio activity for one rune, deduplicates repeated outpoints, and validates the response shape.
 */
export async function getPortfolioActivity(
  address: string,
  runeId: string,
  count: number,
  provider: RuneProvider,
): Promise<PortfolioActivityResponse> {
  const { data: activity } = await provider.runes.walletActivity({
    address,
    rune_id: runeId,
    count,
  });

  const onlyRunes = activity.filter((tx) => tx.rune_id === runeId);
  const keys = new Set<string>();
  const deduplicated = onlyRunes.filter((tx) => {
    const key = `${tx.event_type}:${tx.outpoint}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });

  return PortfolioActivityResponseSchema.parse({
    activity: deduplicated,
    truncated: activity.length === count,
    originalFetchCount: activity.length,
    deduplicatedCount: deduplicated.length,
  });
}
