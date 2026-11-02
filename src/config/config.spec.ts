import { afterEach, describe, expect, test, vi } from 'vitest';

const loadDustAmount = async (dustAmount?: string) => {
  vi.resetModules();
  vi.stubEnv('DUST_AMOUNT', dustAmount);
  const { config } = await import('./config');
  return config.protocol.dustAmount;
};

describe('DUST_AMOUNT', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test('defaults to 546 when unset', async () => {
    await expect(loadDustAmount(undefined)).resolves.toBe(546);
  });

  test('accepts 546', async () => {
    await expect(loadDustAmount('546')).resolves.toBe(546);
  });

  test.each(['545', '0', ''])('refuses %j', async (dustAmount) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });

    await expect(loadDustAmount(dustAmount)).rejects.toThrow('exit 1');
  });
});
