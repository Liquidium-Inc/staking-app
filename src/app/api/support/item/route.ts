import { NextRequest, NextResponse } from 'next/server';

import { config } from '@/config/config';
import { supportError } from '@/server/support/auth';
import { SupportErrorCode } from '@/server/support/constants';
import { handleSupportRequest } from '@/server/support/handler';
import { identitySchema, resolveIdentityAddress } from '@/server/support/identity';
import { itemRequestSchema, loadSupportItem } from '@/server/support/item';

export const dynamic = 'force-dynamic';

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

const requestSchema = itemRequestSchema.and(identitySchema);

export const POST = (request: NextRequest) =>
  handleSupportRequest(request, requestSchema, async (body) => {
    const address = resolveIdentityAddress(body, config.support.tokenSecret);
    if (!address) return supportError(SupportErrorCode.Unauthorized, HTTP_UNAUTHORIZED);

    const item = await loadSupportItem(address, { kind: body.kind, id: body.id });
    if (!item) return supportError(SupportErrorCode.NotFound, HTTP_NOT_FOUND);
    return NextResponse.json({ item });
  });
