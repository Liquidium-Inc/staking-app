import { NextRequest, NextResponse } from 'next/server';

import { config } from '@/config/config';
import { supportError } from '@/server/support/auth';
import { SupportErrorCode } from '@/server/support/constants';
import { handleSupportRequest } from '@/server/support/handler';
import { identitySchema, resolveIdentityAddress } from '@/server/support/identity';
import { listRequestSchema, listSupportItems, parseListRequest } from '@/server/support/list';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

const requestSchema = listRequestSchema.and(identitySchema);

export const POST = (request: NextRequest) =>
  handleSupportRequest(request, requestSchema, async (body) => {
    const parsed = parseListRequest(body);
    if ('error' in parsed) return supportError(parsed.error, HTTP_BAD_REQUEST);

    const address = resolveIdentityAddress(body, config.support.tokenSecret);
    if (!address) return supportError(SupportErrorCode.Unauthorized, HTTP_UNAUTHORIZED);

    return NextResponse.json(await listSupportItems(address, parsed.request));
  });
