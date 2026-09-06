# Glossary

- **SLA:** Service Level Agreement. This benchmark uses versioned latency budgets for release gating; they are not production service guarantees.
- **Baseline:** A versioned reference result used by the regression comparison gate.
- **BPE:** Byte-Pair Encoding, the tokenization method used for compiled `cl100k_base` counts.
- **MCP:** Model Context Protocol, the JSON-RPC boundary exercised by the subprocess adapter.
- **DAG:** Directed Acyclic Graph, the dependency structure used for task scheduling.
- **CAS:** Compare-and-Swap, the atomic claim pattern used for lease coordination.
- **Worktree:** A Git working tree linked to a repository, allowing isolated agent changes.
- **Waymark:** The in-flight continuity ledger used to record and resume agent trajectories across compaction.
