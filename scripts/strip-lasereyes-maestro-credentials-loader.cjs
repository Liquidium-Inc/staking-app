const MAESTRO_MAINNET_API_URL = 'https://xbt-mainnet.gomaestro-api.org/v0';
const CREDENTIAL_SEARCH_WINDOW_LENGTH = 512;
const API_KEY_LITERAL_PATTERN = /(["'])([A-Za-z0-9_-]{32})\1/g;

function findEmbeddedMaestroCredentialRanges(source) {
  const ranges = [];
  let searchFrom = 0;

  while (searchFrom < source.length) {
    const apiUrlIndex = source.indexOf(MAESTRO_MAINNET_API_URL, searchFrom);
    if (apiUrlIndex === -1) break;

    const windowStart = Math.max(0, apiUrlIndex - CREDENTIAL_SEARCH_WINDOW_LENGTH);
    const window = source.slice(windowStart, apiUrlIndex);

    for (const match of window.matchAll(API_KEY_LITERAL_PATTERN)) {
      const start = windowStart + match.index + 1;
      ranges.push({ start, end: start + match[2].length });
    }

    searchFrom = apiUrlIndex + MAESTRO_MAINNET_API_URL.length;
  }

  return ranges;
}

function findEmbeddedMaestroCredentialRangesInSourceMap(source) {
  const sourceMap = JSON.parse(source);
  const ranges = [];

  function collectSourceMapRanges(map) {
    if (!map || typeof map !== 'object') return;

    if (Array.isArray(map.sourcesContent)) {
      for (const sourceContent of map.sourcesContent) {
        if (typeof sourceContent === 'string') {
          ranges.push(...findEmbeddedMaestroCredentialRanges(sourceContent));
        }
      }
    }

    if (Array.isArray(map.sections)) {
      for (const section of map.sections) {
        collectSourceMapRanges(section?.map);
      }
    }
  }

  collectSourceMapRanges(sourceMap);
  return ranges;
}

function stripLaserEyesMaestroCredentials(source) {
  const ranges = findEmbeddedMaestroCredentialRanges(source);

  if (ranges.length === 0) return source;
  if (ranges.length !== 2) {
    throw new Error(`Expected two embedded Maestro credentials, found ${ranges.length}`);
  }

  return [...ranges]
    .reverse()
    .reduce(
      (sanitizedSource, range) =>
        sanitizedSource.slice(0, range.start) + sanitizedSource.slice(range.end),
      source,
    );
}

module.exports = stripLaserEyesMaestroCredentials;
module.exports.findEmbeddedMaestroCredentialRanges = findEmbeddedMaestroCredentialRanges;
module.exports.findEmbeddedMaestroCredentialRangesInSourceMap =
  findEmbeddedMaestroCredentialRangesInSourceMap;
