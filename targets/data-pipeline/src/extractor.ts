import { RawRecord } from './schema.js';

export class StreamExtractor {
  constructor(private rawRecords: RawRecord[]) {}

  async *extractBatch(batchSize = 10): AsyncGenerator<RawRecord[]> {
    for (let i = 0; i < this.rawRecords.length; i += batchSize) {
      yield this.rawRecords.slice(i, i + batchSize);
    }
  }
}
