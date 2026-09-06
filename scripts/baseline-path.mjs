import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const HISTORICAL_VERSIONS = ['2.3.0', '2.2.1', '2.2.0', '2.1.3', '2.1.0', '2.0.0', '1.2.0', '1.1.0', '1.0.0'];

export function compareVersions(left, right) {
  const parse = (value) => {
    const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? match.slice(1).map((part) => Number.parseInt(part, 10)) : null;
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < 3; index++) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1;
  }
  return 0;
}

export function supportedVersionsAtMost(currentVersion) {
  return [currentVersion, ...HISTORICAL_VERSIONS.filter((version) => {
    const comparison = compareVersions(version, currentVersion);
    return version !== currentVersion && comparison !== null && comparison <= 0;
  })];
}

export function versionedDocumentCandidates(rootDir, currentVersion, filename) {
  return supportedVersionsAtMost(currentVersion).flatMap((version) => [
    resolve(rootDir, 'docs', version, filename),
    resolve(rootDir, version, filename),
    resolve(rootDir, '..', version, filename),
    resolve(rootDir, '..', 'docs', version, filename),
  ]);
}

export function resolveBaselinePath(rootDir) {
  const packageData = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  const versions = supportedVersionsAtMost(packageData.version);

  for (const version of versions) {
    const candidate = resolve(rootDir, `BASELINE_v${version}.json`);
    if (existsSync(candidate)) return candidate;
  }

  return resolve(rootDir, `BASELINE_v${packageData.version}.json`);
}
