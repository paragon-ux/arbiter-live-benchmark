import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HISTORICAL_VERSIONS = ['2.3.0', '2.1.0', '2.0.0', '1.2.0', '1.1.0', '1.0.0'];

function compareVersions(left, right) {
  const parse = (value) => String(value).split('.').slice(0, 3).map((part) => Number.parseInt(part, 10));
  const leftParts = parse(left);
  const rightParts = parse(right);
  if (leftParts.some((part) => !Number.isInteger(part)) || rightParts.some((part) => !Number.isInteger(part))) return null;
  for (let index = 0; index < 3; index++) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1;
  }
  return 0;
}

export function resolveBaselinePath(rootDir) {
  const packageData = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  const versions = [
    packageData.version,
    ...HISTORICAL_VERSIONS.filter((version) => {
      const comparison = compareVersions(version, packageData.version);
      return version !== packageData.version && comparison !== null && comparison <= 0;
    }),
  ];

  for (const version of versions) {
    const candidate = resolve(rootDir, `BASELINE_v${version}.json`);
    if (existsSync(candidate)) return candidate;
  }

  return resolve(rootDir, `BASELINE_v${packageData.version}.json`);
}
