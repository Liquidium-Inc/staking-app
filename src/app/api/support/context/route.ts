import { NextRequest, NextResponse } from 'next/server';

import { config } from '@/config/config';
import { supportError } from '@/server/support/auth';
import { SupportErrorCode } from '@/server/support/constants';
import { loadStakingFacts } from '@/server/support/facts';
import { handleSupportRequest } from '@/server/support/handler';
import { computeHints } from '@/server/support/hints';
import { identitySchema, resolveIdentityAddress } from '@/server/support/identity';
import { buildSummary, buildValues, hasStakingFootprint } from '@/server/support/summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HTTP_UNAUTHORIZED = 401;

export const POST = (request: NextRequest) =>
  handleSupportRequest(request, identitySchema, async (identity) => {
    const address = resolveIdentityAddress(identity, config.support.tokenSecret);
    if (!address) return supportError(SupportErrorCode.Unauthorized, HTTP_UNAUTHORIZED);

    const nowMs = Date.now();
    const facts = await loadStakingFacts(address);
    if (!hasStakingFootprint(facts)) {
      return NextResponse.json({ summary: { found: false }, hints: [], values: [] });
    }
    return NextResponse.json({
      summary: buildSummary(facts, nowMs),
      hints: computeHints(facts, nowMs),
      values: buildValues(facts),
    });
  });
