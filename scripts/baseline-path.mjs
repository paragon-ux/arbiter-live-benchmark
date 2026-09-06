import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HISTORICAL_VERSIONS = ['2.3.0', '2.1.0', '2.0.0', '1.2.0', '1.1.0', '1.0.0'];

export function resolveBaselinePath(rootDir) {
  const packageData = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  const versions = [packageData.version, ...HISTORICAL_VERSIONS.filter((version) => version !== packageData.version)];

  for (const version of versions) {
    const candidate = resolve(rootDir, `BASELINE_v${version}.json`);
    if (existsSync(candidate)) return candidate;
  }

  return resolve(rootDir, `BASELINE_v${packageData.version}.json`);
}
