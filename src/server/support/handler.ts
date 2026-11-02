import type { NextResponse } from 'next/server';
import type { z } from 'zod';

import { config } from '@/config/config';
import { logger } from '@/lib/logger';

import { rejectUnauthorizedSupportRequest, supportError } from './auth';
import { SupportErrorCode } from './constants';

const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_SERVER_ERROR = 500;

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Shared wrapper for the server-to-server support routes: API key, body validation, errors. */
export async function handleSupportRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
  handle: (body: z.infer<Schema>) => Promise<NextResponse>,
): Promise<NextResponse> {
  const rejection = rejectUnauthorizedSupportRequest(request, config.support.apiKey);
  if (rejection) return rejection;

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return supportError(SupportErrorCode.BadRequest, HTTP_BAD_REQUEST);

  try {
    return await handle(parsed.data);
  } catch (error) {
    logger.error('support: request failed', {
      path: new URL(request.url).pathname,
      error: error instanceof Error ? error.message : String(error),
    });
    return supportError(SupportErrorCode.Internal, HTTP_INTERNAL_SERVER_ERROR);
  }
}
