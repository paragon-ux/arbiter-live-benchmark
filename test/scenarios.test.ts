import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScenario } from '../src/harness/validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const scenariosDir = path.resolve(rootDir, 'scenarios');

describe('Scenario Schema Validation Suite', () => {
  it('verifies each of the 23 scenario JSON files strictly satisfies the schema and target constraints', () => {
    const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.json')).sort();
    assert.equal(files.length, 23, `Expected 23 scenarios, found ${files.length}`);

    for (const f of files) {
      const content = fs.readFileSync(path.join(scenariosDir, f), 'utf8').replace(/^\uFEFF/, '');
      const json = JSON.parse(content);

      const result = validateScenario(json, rootDir, f);
      assert.ok(
        result.valid,
        `Scenario ${f} failed validation: ${result.issues.map(i => `${i.field}: ${i.message}`).join(', ')}`
      );
    }
  });
});
