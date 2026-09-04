import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scenariosDir = path.resolve(__dirname, '../../scenarios');

describe('Scenario Schema Validation Suite', () => {
  it('verifies each of the 20 scenario JSON files has required schema properties', () => {
    const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.json'));
    assert.equal(files.length, 20, `Expected 20 scenarios, found ${files.length}`);

    for (const f of files) {
      const content = fs.readFileSync(path.join(scenariosDir, f), 'utf8').replace(/^\uFEFF/, '');
      const json = JSON.parse(content);

      const expectedId = f.replace(/\.json$/, '');
      assert.equal(json.id, expectedId, `${f} id does not match filename`);
      assert.ok(typeof json.title === 'string' && json.title.length > 0, `${f} missing title`);
      assert.ok(typeof json.description === 'string' && json.description.length > 0, `${f} missing description`);
      assert.ok(typeof json.targetRepo === 'string' && json.targetRepo.length > 0, `${f} missing targetRepo`);
      assert.ok(typeof json.mode === 'string' && json.mode.length > 0, `${f} missing mode`);
      assert.ok(typeof json.expectedMetrics === 'object' && json.expectedMetrics !== null, `${f} missing expectedMetrics`);

      if (json.tasks) {
        assert.ok(Array.isArray(json.tasks), `${f} tasks must be an array`);
        for (const t of json.tasks) {
          assert.ok(t.id, `${f} task missing id`);
        }
      }
    }
  });
});
