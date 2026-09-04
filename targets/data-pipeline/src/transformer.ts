import { RawRecord, NormalizedRecord, validateRawRecord } from './schema.js';

export class RecordTransformer {
  transform(raw: unknown): NormalizedRecord {
    if (!validateRawRecord(raw)) {
      throw new Error('Invalid raw record format');
    }

    const epochMs = new Date(raw.timestamp).getTime();
    if (isNaN(epochMs)) {
      throw new Error(`Malformed timestamp: ${raw.timestamp}`);
    }

    const metricValue = typeof raw.value === 'number' ? raw.value : parseFloat(raw.value);
    if (isNaN(metricValue)) {
      throw new Error(`Malformed numeric value: ${raw.value}`);
    }

    return {
      id: raw.id,
      epochMs,
      source: raw.source.toLowerCase().trim(),
      metricValue,
      tagCount: raw.tags?.length || 0,
      normalizedAt: Date.now()
    };
  }
}
