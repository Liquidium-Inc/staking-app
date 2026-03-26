import { NextResponse } from 'next/server';
import { z } from 'zod';

import { config } from '@/config/public';
import { runeProvider } from '@/providers/rune-provider';
import {
  getPortfolioActivity,
  PORTFOLIO_ACTIVITY_HISTORY_COUNT,
  type PortfolioActivityResponse,
} from '@/services/portfolio-activity';

const AddressQuerySchema = z.object({
  address: z
    .string()
    .min(1)
    .regex(/^(bc1|tb1|[13mn2][a-zA-Z0-9]{24,59})[a-zA-Z0-9]*$/),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const parseResult = AddressQuerySchema.safeParse({
    address: searchParams.get('address'),
  });

  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const { address } = parseResult.data;

  const result = await getPortfolioActivity(
    address,
    config.sRune.id,
    PORTFOLIO_ACTIVITY_HISTORY_COUNT,
    runeProvider,
  );

  return NextResponse.json<PortfolioActivityResponse>(result);
}