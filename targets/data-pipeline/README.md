# Data Pipeline Target
An ETL transformation pipeline that extracts raw telemetry records, applies schema normalization, and streams validated records to sinks.

## Known Refactoring Tasks
1. Parallelize batch transformer using chunked async workers.
2. Add dead-letter queue (DLQ) for malformed input records.
