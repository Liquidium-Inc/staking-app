import type { NextRequest } from 'next/server';

import { getPostHogServer } from '@/app/posthog-server';

function extractDistinctIdFromCookieHeader(cookieHeader?: string | null) {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/ph_phc_.*?_posthog=([^;]+)/);
  if (match && match[1]) {
    try {
      const decoded = decodeURIComponent(match[1]);
      const data = JSON.parse(decoded);
      if (data?.distinct_id && typeof data.distinct_id === 'string') return data.distinct_id;
    } catch {
      // ignore parse failures
    }
  }
  return undefined;
}

export async function captureServerException(
  req: NextRequest,
  error: Error & { txid?: string },
  props?: Record<string, string | number | boolean | undefined>,
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const posthog = await getPostHogServer();
    const cookieHeader = req.headers.get('cookie');
    const distinctId = extractDistinctIdFromCookieHeader(cookieHeader);
    // captureException(error, distinctId?, properties?) per PostHog docs
    const url = new URL(req.url);
    await posthog.captureException(error, distinctId, {
      path: url.pathname,
      method: req.method,
      user_agent: req.headers.get('user-agent') || undefined,
      network: process.env.NEXT_PUBLIC_NETWORK,
      txid: error.txid,
      ...props,
    });
  } catch {
    // swallow errors from telemetry path
  }
}
