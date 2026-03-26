import { NextResponse } from 'next/server';
import { z } from 'zod';

import { config } from '@/config/public';
import { runeProvider } from '@/providers/rune-provider';
import { getPortfolioActivity } from '@/services/portfolioActivity.service';

const PORTFOLIO_ACTIVITY_HISTORY_COUNT = 5000;
const runeId = config.sRune.id;
const ADDRESS_PATTERN =
  config.network === 'testnet4'
    ? /^(?:tb1[ac-hj-np-z02-9]{8,87}|[mn2][a-km-zA-HJ-NP-Z1-9]{25,34})$/
    : /^(?:bc1[ac-hj-np-z02-9]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;

const AddressQuerySchema = z.object({
  address: z.string().trim().min(1).regex(ADDRESS_PATTERN),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedQuery = AddressQuerySchema.safeParse(Object.fromEntries(searchParams));

  if (!parsedQuery.success) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const result = await getPortfolioActivity(
    parsedQuery.data.address,
    runeId,
    PORTFOLIO_ACTIVITY_HISTORY_COUNT,
    runeProvider,
  );

  return NextResponse.json(result);
}
