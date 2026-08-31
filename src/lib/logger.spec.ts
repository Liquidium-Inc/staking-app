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

  it('drops object-valued error code and status metadata', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(new Error('Upstream request failed'), {
      code: { value: 'ERR_BAD_RESPONSE', secret: 'code secret' },
      status: { value: 502, secret: 'status secret' },
    });

    logger.error(error);

    expect(consoleError).toHaveBeenCalledOnce();
    const logged = consoleError.mock.calls[0];
    expect(logged).toEqual([
      '[error]',
      expect.objectContaining({
        name: 'Error',
        message: 'Upstream request failed',
      }),
    ]);
    expect(logged[1]).not.toHaveProperty('code');
    expect(logged[1]).not.toHaveProperty('status');
    expect(JSON.stringify(logged)).not.toContain('secret');
  });

  it('preserves primitive error code and status metadata', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(new Error('Upstream request failed'), {
      code: 'ERR_BAD_RESPONSE',
      status: 502,
    });

    logger.error(error);

    expect(consoleError).toHaveBeenCalledWith(
      '[error]',
      expect.objectContaining({
        code: 'ERR_BAD_RESPONSE',
        status: 502,
      }),
    );
  });

  it('reads error metadata once before validating it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('Upstream request failed') as Error & { code?: unknown };
    let reads = 0;
    Object.defineProperty(error, 'code', {
      get: () => {
        reads += 1;
        return reads === 1 ? 'ERR_BAD_RESPONSE' : { secret: 'leaked' };
      },
    });

    logger.error(error);

    expect(reads).toBe(1);
    expect(consoleError).toHaveBeenCalledWith(
      '[error]',
      expect.objectContaining({ code: 'ERR_BAD_RESPONSE' }),
    );
    expect(JSON.stringify(consoleError.mock.calls[0])).not.toContain('secret');
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
