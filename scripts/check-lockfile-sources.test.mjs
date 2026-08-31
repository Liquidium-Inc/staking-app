import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertAllowedLockfileSources, findExoticSources } from './check-lockfile-sources.mjs';

const allowedSource =
  'https://codeload.github.com/kungfuflex/alkanes/tar.gz/7a3326b12702c044424d10b37c048e06ebefb3d2';

test('accepts the pinned alkanes tarball', () => {
  const lockfile = `
lockfileVersion: '9.0'
packages:
  alkanes@${allowedSource}:
    resolution: {gitHosted: true, tarball: ${allowedSource}}
`;

  assert.doesNotThrow(() => assertAllowedLockfileSources(lockfile));
});

test('rejects any other direct tarball', () => {
  const source = 'https://example.com/packages/injected.tgz';
  const lockfile = `
lockfileVersion: '9.0'
packages:
  injected@${source}:
    resolution: {tarball: ${source}}
`;

  assert.throws(() => assertAllowedLockfileSources(lockfile), new RegExp(source));
});

test('rejects Git dependency sources', () => {
  const source = 'git+ssh://git@github.com/example/injected.git#0123456789abcdef';
  const lockfile = `
lockfileVersion: '9.0'
packages:
  injected@${source}:
    resolution: {commit: 0123456789abcdef, repo: ${source}, type: git}
`;

  assert.deepEqual(findExoticSources(lockfile), [source]);
  assert.throws(
    () => assertAllowedLockfileSources(lockfile),
    (error) => error instanceof Error && error.message.includes(source),
  );
});

test('rejects exotic snapshot keys and dependency values even without a package entry', () => {
  const source = 'https://example.com/packages/injected.tgz';
  const lockfile = `
lockfileVersion: '9.0'
packages:
  parent@1.0.0:
    resolution: {integrity: sha512-example}
snapshots:
  injected@${source}:
    dependencies:
      injected: ${source}
`;

  assert.deepEqual(findExoticSources(lockfile), [source]);
});

test('ignores informational URLs in package metadata', () => {
  const lockfile = `
lockfileVersion: '9.0'
packages:
  deprecated-package@1.0.0:
    resolution: {integrity: sha512-example}
    deprecated: 'See https://example.com/migration for details'
`;

  assert.deepEqual(findExoticSources(lockfile), []);
});
