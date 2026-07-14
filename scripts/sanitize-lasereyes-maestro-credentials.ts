import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
type CredentialStripper = ((source: string) => string) & {
  findEmbeddedMaestroCredentialRanges: (source: string) => Array<{ start: number; end: number }>;
};
const stripLaserEyesMaestroCredentials =
  require('./strip-lasereyes-maestro-credentials-loader.cjs') as CredentialStripper;
const laserEyesPackages = ['@omnisat/lasereyes-core', '@omnisat/lasereyes-react'];
const bundlePaths = laserEyesPackages.flatMap((packageName) => {
  const distDirectory = dirname(require.resolve(packageName));
  return [join(distDirectory, 'index.js'), join(distDirectory, 'index.umd.cjs')];
});

let totalReplacements = 0;

for (const bundlePath of bundlePaths) {
  if (!existsSync(bundlePath)) {
    throw new Error(`LaserEyes bundle not found: ${bundlePath}`);
  }

  const source = await readFile(bundlePath, 'utf8');
  const replacements = stripLaserEyesMaestroCredentials.findEmbeddedMaestroCredentialRanges(source);
  const sanitizedSource = stripLaserEyesMaestroCredentials(source);

  if (replacements.length > 0) {
    await writeFile(bundlePath, sanitizedSource, 'utf8');
  }

  totalReplacements += replacements.length;
}

console.log(`LaserEyes Maestro credentials removed: ${totalReplacements}`);
