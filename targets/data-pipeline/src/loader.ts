import { NormalizedRecord } from './schema.js';

export class DataSink {
  private sink: NormalizedRecord[] = [];

  load(records: NormalizedRecord[]): number {
    this.sink.push(...records);
    return records.length;
  }

  getRecords(): NormalizedRecord[] {
    return [...this.sink];
  }

  count(): number {
    return this.sink.length;
  }
}
