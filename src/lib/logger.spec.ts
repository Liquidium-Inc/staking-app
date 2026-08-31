import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not serialize enumerable error request configuration', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(new Error('Upstream request failed'), {
      code: 'ERR_BAD_RESPONSE',
      config: { headers: { Authorization: 'Bearer secret' } },
    });

    logger.error('Request failed', { error });

    expect(consoleError).toHaveBeenCalledOnce();
    const logged = consoleError.mock.calls[0];
    expect(logged).toEqual([
      '[error]',
      'Request failed',
      {
        error: expect.objectContaining({
          name: 'Error',
          message: 'Upstream request failed',
          code: 'ERR_BAD_RESPONSE',
        }),
      },
    ]);
    expect(JSON.stringify(logged)).not.toContain('Bearer secret');
    expect(JSON.stringify(logged)).not.toContain('config');
  });
});
