import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleSupportRequest } from '@/server/support/handler';
import { getSupportHealth } from '@/server/support/health';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({}).passthrough().optional();

export const POST = (request: NextRequest) =>
  handleSupportRequest(request, requestSchema, async () =>
    NextResponse.json(await getSupportHealth()),
  );
