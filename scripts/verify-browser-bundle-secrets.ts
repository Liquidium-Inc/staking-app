import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const browserChunksDirectory = join(process.cwd(), '.next', 'static', 'chunks');
const require = createRequire(import.meta.url);
const { findEmbeddedMaestroCredentialRanges } =
  require('./strip-lasereyes-maestro-credentials-loader.cjs') as {
    findEmbeddedMaestroCredentialRanges: (source: string) => Array<{ start: number; end: number }>;
  };

async function collectJavaScriptArtifacts(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      paths.push(...(await collectJavaScriptArtifacts(entryPath)));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.js.map')) {
      paths.push(entryPath);
    }
  }

  return paths;
}

const artifactPaths = await collectJavaScriptArtifacts(browserChunksDirectory);
const exposedArtifacts: string[] = [];

for (const artifactPath of artifactPaths) {
  const source = await readFile(artifactPath, 'utf8');
  if (findEmbeddedMaestroCredentialRanges(source).length > 0) {
    exposedArtifacts.push(artifactPath);
  }
}

if (exposedArtifacts.length > 0) {
  throw new Error(
    `Embedded Maestro credentials found in browser artifacts:\n${exposedArtifacts.join('\n')}`,
  );
}

console.log(`Browser artifacts checked for embedded Maestro credentials: ${artifactPaths.length}`);
