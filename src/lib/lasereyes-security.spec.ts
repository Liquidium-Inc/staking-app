import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const MAESTRO_API_URL = 'https://xbt-mainnet.gomaestro-api.org/v0';
const MAINNET_TEST_KEY = 'a'.repeat(32);
const TESTNET_TEST_KEY = 'b'.repeat(32);
const require = createRequire(import.meta.url);
const stripLaserEyesMaestroCredentials =
  require('../../scripts/strip-lasereyes-maestro-credentials-loader.cjs') as ((
    source: string,
  ) => string) & {
    findEmbeddedMaestroCredentialRanges: (source: string) => Array<{ start: number; end: number }>;
    countEmbeddedMaestroCredentialsInSourceMap: (source: string) => number;
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

  it('detects a credential literal at the search window boundary', () => {
    const credentialLiteral = `"${MAINNET_TEST_KEY}"`;
    const source = `${credentialLiteral}${'x'.repeat(512 - credentialLiteral.length)}${MAESTRO_API_URL}`;

    expect(
      stripLaserEyesMaestroCredentials.findEmbeddedMaestroCredentialRanges(source),
    ).toHaveLength(1);
  });

  it('deduplicates credentials found near repeated Maestro URLs', () => {
    const source = `const mainnet="${MAINNET_TEST_KEY}",first="${MAESTRO_API_URL}",testnet="${TESTNET_TEST_KEY}",second="${MAESTRO_API_URL}";`;
    const result = stripLaserEyesMaestroCredentials(source);

    expect(result).not.toContain(MAINNET_TEST_KEY);
    expect(result).not.toContain(TESTNET_TEST_KEY);
    expect(result.split(MAESTRO_API_URL)).toHaveLength(3);
  });

  it('detects credentials embedded in source map sourcesContent', () => {
    const sourceMap = JSON.stringify({
      version: 3,
      sources: ['lasereyes.js'],
      names: [],
      mappings: '',
      sourcesContent: [createLaserEyesSource(MAINNET_TEST_KEY, TESTNET_TEST_KEY)],
    });

    expect(
      stripLaserEyesMaestroCredentials.countEmbeddedMaestroCredentialsInSourceMap(sourceMap),
    ).toBe(2);
  });

  it('reports malformed source maps clearly', () => {
    expect(() =>
      stripLaserEyesMaestroCredentials.countEmbeddedMaestroCredentialsInSourceMap('{'),
    ).toThrow('Failed to parse source map for credential scan');
  });
});
