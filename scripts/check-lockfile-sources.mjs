import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ALLOWED_EXOTIC_SOURCES = new Set([
  'https://codeload.github.com/kungfuflex/alkanes/tar.gz/7a3326b12702c044424d10b37c048e06ebefb3d2',
]);

const SOURCE_PATTERN =
  /(?:git\+(?:https?|ssh|file):\/\/|git:\/\/|ssh:\/\/|github:|gitlab:|bitbucket:|https?:\/\/)[^\s,'"}\])]+/gi;

function extractSource(value) {
  return (value.match(SOURCE_PATTERN) ?? []).map((source) =>
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

      for (const field of line.matchAll(/\b(?:repo|tarball):\s*([^,}]+)/g)) {
        for (const source of extractSource(field[1])) sources.add(source);
      }
    }

    if ((section === 'importers' || section === 'snapshots') && /^ {2,}\S/.test(line)) {
      for (const source of extractSource(line)) sources.add(source);
    }
  }

  return [...sources].sort();
}

export function assertAllowedLockfileSources(lockfile) {
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
