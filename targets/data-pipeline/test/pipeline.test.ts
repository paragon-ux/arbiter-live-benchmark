import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StreamExtractor, RecordTransformer, DataSink, ETLPipeline, RawRecord } from '../src/index.js';

describe('ETLPipeline Suite', () => {
  it('processes raw records and transforms them into normalized sink', async () => {
    const raw: RawRecord[] = [
      { id: 'rec-1', timestamp: '2026-09-04T00:00:00Z', source: 'SENSOR_A', value: '42.5', tags: ['alpha'] },
      { id: 'rec-2', timestamp: '2026-09-04T00:01:00Z', source: 'SENSOR_B', value: 100, tags: ['beta', 'gamma'] }
    ];

    const extractor = new StreamExtractor(raw);
    const transformer = new RecordTransformer();
    const sink = new DataSink();
    const pipeline = new ETLPipeline(extractor, transformer, sink);

    const summary = await pipeline.run();
    assert.equal(summary.totalProcessed, 2);
    assert.equal(summary.totalErrors, 0);
    assert.equal(sink.count(), 2);

    const items = sink.getRecords();
    assert.equal(items[0].source, 'sensor_a');
    assert.equal(items[0].metricValue, 42.5);
    assert.equal(items[0].tagCount, 1);
  });
});
