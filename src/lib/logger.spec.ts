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

  it('preserves shared references across sibling branches', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const shared = { value: 'shared' };

    logger.info({ first: shared, second: shared });

    expect(consoleInfo).toHaveBeenCalledWith('[info]', {
      first: { value: 'shared' },
      second: { value: 'shared' },
    });
  });

  it('replaces ancestor cycles with the circular marker', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    type CircularLogValue = { child?: { parent: CircularLogValue } };
    const circular: CircularLogValue = {};
    circular.child = { parent: circular };

    logger.warn(circular);

    expect(consoleWarn).toHaveBeenCalledWith('[warn]', {
      child: { parent: '[Circular]' },
    });
  });
});
