import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scenariosDir = path.resolve(__dirname, '../../scenarios');

describe('Scenario Schema Validation Suite', () => {
  it('verifies each of the 18 scenario JSON files has required schema properties', () => {
    const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.json'));
    assert.equal(files.length, 18, `Expected 18 scenarios, found ${files.length}`);

    for (const f of files) {
      const content = fs.readFileSync(path.join(scenariosDir, f), 'utf8');
      const json = JSON.parse(content);

      assert.ok(json.id, `${f} missing id`);
      assert.ok(json.title, `${f} missing title`);
      assert.ok(json.description, `${f} missing description`);
      assert.ok(json.targetRepo, `${f} missing targetRepo`);
      assert.ok(json.mode, `${f} missing mode`);
      assert.ok(json.expectedMetrics, `${f} missing expectedMetrics`);
    }
  });
});
