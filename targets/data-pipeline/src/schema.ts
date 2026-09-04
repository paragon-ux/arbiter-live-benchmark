export interface RawRecord {
  id: string;
  timestamp: string;
  source: string;
  value: string | number;
  tags?: string[];
}

export interface NormalizedRecord {
  id: string;
  epochMs: number;
  source: string;
  metricValue: number;
  tagCount: number;
  normalizedAt: number;
}

export function validateRawRecord(record: unknown): record is RawRecord {
  if (typeof record !== 'object' || record === null) return false;
  const r = record as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.timestamp === 'string' && typeof r.source === 'string';
}
