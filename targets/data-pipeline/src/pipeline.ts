import { StreamExtractor } from './extractor.js';
import { RecordTransformer } from './transformer.js';
import { DataSink } from './loader.js';
import { RawRecord } from './schema.js';

export interface PipelineSummary {
  totalProcessed: number;
  totalErrors: number;
  durationMs: number;
}

export class ETLPipeline {
  constructor(
    private extractor: StreamExtractor,
    private transformer: RecordTransformer,
    private sink: DataSink
  ) {}

  async run(): Promise<PipelineSummary> {
    const start = performance.now();
    let totalProcessed = 0;
    let totalErrors = 0;

    for await (const batch of this.extractor.extractBatch(5)) {
      const transformed = [];
      for (const item of batch) {
        try {
          transformed.push(this.transformer.transform(item));
          totalProcessed++;
        } catch {
          totalErrors++;
        }
      }
      this.sink.load(transformed);
    }

    return {
      totalProcessed,
      totalErrors,
      durationMs: performance.now() - start
    };
  }
}
