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

test('rejects a double-quoted tarball with escaped URL punctuation', () => {
  const source = 'https://example.com/packages/escaped.tgz';
  const lockfile = String.raw`
lockfileVersion: '9.0'
packages:
  injected@1.0.0:
    resolution: {tarball: "https\u003a\u002f\u002fexample.com/packages/escaped.tgz"}
`;

  assert.deepEqual(findExoticSources(lockfile), [source]);
  assert.throws(
    () => assertAllowedLockfileSources(lockfile),
    (error) => error instanceof Error && error.message.includes(source),
  );
});

test('rejects a double-quoted tarball with escaped slashes', () => {
  const source = 'https://example.com/packages/escaped-slashes.tgz';
  const lockfile = String.raw`
lockfileVersion: '9.0'
packages:
  injected@1.0.0:
    resolution: {tarball: "https:\/\/example.com/packages/escaped-slashes.tgz"}
`;

  assert.deepEqual(findExoticSources(lockfile), [source]);
  assert.throws(
    () => assertAllowedLockfileSources(lockfile),
    (error) => error instanceof Error && error.message.includes(source),
  );
});

test('rejects escaped slashes when the double-quoted tarball also contains an escaped quote', () => {
  const lockfile = String.raw`
lockfileVersion: '9.0'
packages:
  injected@1.0.0:
    resolution: {tarball: "https:\/\/example.com/packages/a\"b.tgz"}
`;

  assert.throws(
    () => assertAllowedLockfileSources(lockfile),
    /unapproved exotic dependency sources/,
  );
});

for (const [key, value] of [
  ['"tarball"', '"https://example.com/packages/double-quoted.tgz"'],
  ["'repo'", "'git+https://github.com/example/single-quoted.git'"],
]) {
  test(`rejects a source with quoted resolution field ${key}`, () => {
    const source = value.slice(1, -1);
    const lockfile = `
lockfileVersion: '9.0'
packages:
  injected@1.0.0:
    resolution: {${key}: ${value}}
`;

    assert.deepEqual(findExoticSources(lockfile), [source]);
    assert.throws(
      () => assertAllowedLockfileSources(lockfile),
      (error) => error instanceof Error && error.message.includes(source),
    );
  });
}

for (const indicator of ['>-', '|2']) {
  test(`rejects a continued tarball using the ${indicator} block scalar indicator`, () => {
    const lockfile = `
lockfileVersion: '9.0'
packages:
  injected@1.0.0:
    resolution:
      tarball: ${indicator}
        https://example.com/packages/injected.tgz
`;

    assert.throws(
      () => assertAllowedLockfileSources(lockfile),
      /unsupported block scalar repo or tarball source/,
    );
  });
}

test('rejects a continued tarball with an anchor before the block scalar', () => {
  const lockfile = `
lockfileVersion: '9.0'
packages:
  injected@1.0.0:
    resolution:
      tarball: &source >-
        https://example.com/packages/injected.tgz
`;

  assert.throws(
    () => assertAllowedLockfileSources(lockfile),
    /unsupported block scalar repo or tarball source/,
  );
});

test('rejects a tarball source hidden behind a YAML anchor and alias', () => {
  const lockfile = `
lockfileVersion: '9.0'
packages:
  source@1.0.0:
    resolution: {integrity: &source https://example.com/packages/injected.tgz}
  injected@1.0.0:
    resolution: {tarball: *source}
`;

  assert.throws(
    () => assertAllowedLockfileSources(lockfile),
    /unsupported YAML reference repo or tarball source/,
  );
});

test('rejects a tarball source split across an escaped line break', () => {
  const lockfile = String.raw`
lockfileVersion: '9.0'
packages:
  injected@1.0.0:
    resolution: {tarball: "https:\
      //example.com/packages/injected.tgz"}
`;

  assert.throws(
    () => assertAllowedLockfileSources(lockfile),
    /unsupported multiline repo or tarball source/,
  );
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

test('rejects a local file dependency source', () => {
  const source = 'file:../local-package';
  const lockfile = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      local-package:
        specifier: ${source}
        version: ${source}
`;

  assert.deepEqual(findExoticSources(lockfile), [source]);
  assert.throws(
    () => assertAllowedLockfileSources(lockfile),
    (error) => error instanceof Error && error.message.includes(source),
  );
});

test('rejects a local link dependency source', () => {
  const source = 'link:../local-package';
  const lockfile = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      local-package:
        specifier: ${source}
        version: ${source}
`;

  assert.deepEqual(findExoticSources(lockfile), [source]);
  assert.throws(
    () => assertAllowedLockfileSources(lockfile),
    (error) => error instanceof Error && error.message.includes(source),
  );
});

test('rejects a relative git+file dependency source', () => {
  const source = 'git+file:../local-repository#0123456789abcdef';
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

test('ignores comment-only URLs in importers and snapshots', () => {
  const lockfile = `
lockfileVersion: '9.0'
importers:
  .:
    # See https://example.com/importer-docs
snapshots:
  package@1.0.0:
    # See https://example.com/snapshot-docs
`;

  assert.deepEqual(findExoticSources(lockfile), []);
  assert.doesNotThrow(() => assertAllowedLockfileSources(lockfile));
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
