import { describe, expect, it } from 'vitest';

import { isSupportApiKeyValid, rejectUnauthorizedSupportRequest } from './auth';

const API_KEY = 'support-api-key-for-tests';

function requestWith(authorization?: string) {
  return new Request('http://localhost/api/support/context', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

describe('support API key guard', () => {
  it('returns 404 when SUPPORT_API_KEY is unset, even with a header', async () => {
    const response = rejectUnauthorizedSupportRequest(requestWith(`Bearer ${API_KEY}`), undefined);

    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({ error: 'not_found' });
  });

  it('returns 401 for a missing, malformed or wrong key', () => {
    for (const header of [undefined, API_KEY, 'Bearer ', 'Bearer wrong', `Basic ${API_KEY}`]) {
      expect(rejectUnauthorizedSupportRequest(requestWith(header), API_KEY)?.status).toBe(401);
    }
  });

  it('lets the correct key through', () => {
    expect(rejectUnauthorizedSupportRequest(requestWith(`Bearer ${API_KEY}`), API_KEY)).toBeNull();
    expect(isSupportApiKeyValid(`Bearer ${API_KEY}x`, API_KEY)).toBe(false);
  });
});
