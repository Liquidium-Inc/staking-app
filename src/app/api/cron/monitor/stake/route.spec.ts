import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { config } from '@/config/config';

import { GET } from './route';

const monitorSignedTxs = vi.hoisted(() => vi.fn());

vi.mock('@/server/transactions/monitor', () => ({ monitorSignedTxs }));

const createRequest = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/monitor/stake', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

describe('GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if authorization header is missing', async () => {
    expect((await GET(createRequest())).status).toBe(401);
    expect(monitorSignedTxs).not.toHaveBeenCalled();
  });

  it('returns 401 if authorization header is invalid', async () => {
    expect((await GET(createRequest('wrong-secret'))).status).toBe(401);
    expect(monitorSignedTxs).not.toHaveBeenCalled();
  });

  it('runs the stake monitor', async () => {
    const res = await GET(createRequest(config.secrets.cron));

    expect(await res.json()).toEqual({ success: true });
    expect(monitorSignedTxs).toHaveBeenCalledWith('stake');
  });
});
