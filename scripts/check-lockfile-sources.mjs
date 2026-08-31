import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ALLOWED_EXOTIC_SOURCES = new Set([
  'https://codeload.github.com/kungfuflex/alkanes/tar.gz/7a3326b12702c044424d10b37c048e06ebefb3d2',
]);

const SOURCE_PATTERN =
  /(?:git\+(?:https?|ssh):\/\/|git\+file:|(?<![\w+.-])file:|git:\/\/|ssh:\/\/|github:|gitlab:|bitbucket:|https?:\/\/)[^\s,'"}\])]+/gi;
const SOURCE_FIELD_PATTERN =
  /(?:^|[\s{,])(?:(?:repo|tarball)|"(?:repo|tarball)"|'(?:repo|tarball)')\s*:\s*("[^"]*"|'[^']*'|[^,}]+)/g;
const BLOCK_SCALAR_SOURCE_FIELD_PATTERN =
  /^\s+(?:(?:repo|tarball)|"(?:repo|tarball)"|'(?:repo|tarball)')\s*:\s*[>|][0-9+-]*(?:\s+#.*)?$/;
const DOUBLE_QUOTED_SCALAR_PATTERN = /"(?:[^"\\]|\\.)*"/g;
const HEX_ESCAPE_LENGTHS = { x: 2, u: 4, U: 8 };

function decodeDoubleQuotedHexEscapes(scalar) {
  let decoded = '';

  for (let index = 1; index < scalar.length - 1; index += 1) {
    const character = scalar[index];
    const escapeLength = HEX_ESCAPE_LENGTHS[scalar[index + 1]];

    if (character === '\\' && scalar[index + 1] === '\\') {
      decoded += character;
      index += 1;
      continue;
    }

    if (character !== '\\' || escapeLength === undefined) {
      decoded += character;
      continue;
    }

    const hexStart = index + 2;
    const hex = scalar.slice(hexStart, hexStart + escapeLength);
    if (hex.length !== escapeLength || !/^[\dA-Fa-f]+$/.test(hex)) {
      decoded += character;
      continue;
    }

    const codePoint = Number.parseInt(hex, 16);
    decoded += codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : character;
    index = hexStart + escapeLength - 1;
  }

  return decoded;
}

function decodeDoubleQuotedScalars(value) {
  return value.replace(DOUBLE_QUOTED_SCALAR_PATTERN, decodeDoubleQuotedHexEscapes);
}

function extractSource(value) {
  return (decodeDoubleQuotedScalars(value).match(SOURCE_PATTERN) ?? []).map((source) =>
    source.replace(/\(.+$/, '').replace(/:$/, ''),
  );
}

export function findExoticSources(lockfile) {
  const sources = new Set();
  let section = '';

  for (const line of lockfile.split('\n')) {
    const topLevelKey = line.match(/^(\S[^:]*):/);
    if (topLevelKey) {
      section = topLevelKey[1];
      continue;
    }

    if (section === 'packages') {
      const packageKey = line.match(/^ {2}(.+):$/);
      if (packageKey) {
        for (const source of extractSource(packageKey[1])) sources.add(source);
      }

      for (const field of line.matchAll(SOURCE_FIELD_PATTERN)) {
        for (const source of extractSource(field[1])) sources.add(source);
      }
    }

    if (
      (section === 'importers' || section === 'snapshots') &&
      /^ {2,}\S/.test(line) &&
      !/^\s*#/.test(line)
    ) {
      for (const source of extractSource(line)) sources.add(source);
    }
  }

  return [...sources].sort();
}

export function assertAllowedLockfileSources(lockfile) {
  if (lockfile.split('\n').some((line) => BLOCK_SCALAR_SOURCE_FIELD_PATTERN.test(line))) {
    throw new Error('pnpm-lock.yaml contains an unsupported block scalar repo or tarball source');
  }

  const unexpectedSources = findExoticSources(lockfile).filter(
    (source) => !ALLOWED_EXOTIC_SOURCES.has(source),
  );

  if (unexpectedSources.length > 0) {
    throw new Error(
      `pnpm-lock.yaml contains unapproved exotic dependency sources:\n${unexpectedSources.map((source) => `- ${source}`).join('\n')}`,
    );
  }
}

async function main() {
  const lockfile = await readFile('pnpm-lock.yaml', 'utf8');
  assertAllowedLockfileSources(lockfile);
  console.log('pnpm-lock.yaml exotic dependency sources match the allowlist.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
