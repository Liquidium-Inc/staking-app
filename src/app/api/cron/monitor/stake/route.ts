import { NextRequest } from 'next/server';

import { config } from '@/config/config';
import { monitorSignedTxs } from '@/server/transactions/monitor';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${config.secrets.cron}`)
    return new Response('Unauthorized', { status: 401 });

  await monitorSignedTxs('stake');

  return Response.json({ success: true });
}
