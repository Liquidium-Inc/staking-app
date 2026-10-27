import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleSupportRequest } from '@/server/support/handler';
import { lookupAddress, lookupTxid } from '@/server/support/lookup';

export const dynamic = 'force-dynamic';

const TXID_PATTERN = /^[0-9a-fA-F]{64}$/;
const MAX_ADDRESS_LENGTH = 120;

const requestSchema = z.union([
  z.object({ address: z.string().trim().min(1).max(MAX_ADDRESS_LENGTH) }).strict(),
  z.object({ txid: z.string().trim().regex(TXID_PATTERN) }).strict(),
]);

export const POST = (request: NextRequest) =>
  handleSupportRequest(request, requestSchema, async (body) =>
    NextResponse.json(
      'txid' in body
        ? await lookupTxid(body.txid.toLowerCase())
        : await lookupAddress(body.address),
    ),
  );
