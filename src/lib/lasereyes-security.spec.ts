import { createRequire } from 'node:module';

const MAESTRO_API_URL = 'https://xbt-mainnet.gomaestro-api.org/v0';
const MAINNET_TEST_KEY = 'a'.repeat(32);
const TESTNET_TEST_KEY = 'b'.repeat(32);
const require = createRequire(import.meta.url);
const stripLaserEyesMaestroCredentials =
  require('../../scripts/strip-lasereyes-maestro-credentials-loader.cjs') as ((
    source: string,
  ) => string) & {
    findEmbeddedMaestroCredentialRanges: (source: string) => Array<{ start: number; end: number }>;
  };

function createLaserEyesSource(mainnetKey: string, testnetKey: string) {
  return `const label="lasereyes",mainnet="${mainnetKey}",testnet="${testnetKey}",url="${MAESTRO_API_URL}";`;
}

describe('LaserEyes Maestro credential sanitization', () => {
  it('removes both embedded API keys while preserving the data source', () => {
    const source = createLaserEyesSource(MAINNET_TEST_KEY, TESTNET_TEST_KEY);
    const result = stripLaserEyesMaestroCredentials(source);

    expect(result).toContain(MAESTRO_API_URL);
    expect(result).not.toContain(MAINNET_TEST_KEY);
    expect(result).not.toContain(TESTNET_TEST_KEY);
    expect(
      stripLaserEyesMaestroCredentials.findEmbeddedMaestroCredentialRanges(result),
    ).toHaveLength(0);
  });

  it('leaves an already sanitized package unchanged', () => {
    const source = createLaserEyesSource('', '');

    expect(stripLaserEyesMaestroCredentials(source)).toBe(source);
  });

  it('fails closed when the dependency shape exposes an unexpected key count', () => {
    const source = createLaserEyesSource(MAINNET_TEST_KEY, '');

    expect(() => stripLaserEyesMaestroCredentials(source)).toThrow(
      'Expected two embedded Maestro credentials, found 1',
    );
  });
});
