# Suite Version Registry & Isolation Specification

This document defines the single source of truth for version references across `arbiter-live-benchmark` and its sibling repository `Arbiter`. It establishes strict boundaries between **Living Version Targets** (which track active suite releases) and **Immutable Historical Archives** (which preserve point-in-time benchmark records).

---

## 🎯 Architecture: Zero Blind Searching

To prevent manual grep errors and version drift, all living version references are registered in `scripts/bump-version.mjs`.

### Automated CLI Workflow
```bash
# Check version parity across all living targets (asserts 0 drift)
npm run check:version
# or: node scripts/bump-version.mjs --check

# Bump suite version atomically across all living targets
node scripts/bump-version.mjs 2.3.2
```

---

## 📋 Living Targets Registry (Synchronized via `bump-version.mjs`)

| Target File | Pattern / Field | Purpose |
| :--- | :--- | :--- |
| [`package.json`](../package.json) | `"version": "X.Y.Z"` | NPM package manifest |
| [`README.md`](../README.md) | `https://img.shields.io/badge/version-X.Y.Z-blue.svg` | Root README release badge |
| [`README.md`](../README.md) | `## Empirical Results Summary (vX.Y.Z)` | Results summary section header |
| [`README.md`](../README.md) | `- [Empirical Results Summary (vX.Y.Z)]` | Results summary table of contents link |
| [`CLAIMS.md`](../CLAIMS.md) | `**Document Version:** X.Y.Z-PROD` | Production claims registry |
| [`docs/METHODOLOGY_AND_REVIEWER_FAQ.md`](METHODOLOGY_AND_REVIEWER_FAQ.md) | `**Version:** X.Y.Z` | Methodology document version |
| [`docs/METHODOLOGY_AND_REVIEWER_FAQ.md`](METHODOLOGY_AND_REVIEWER_FAQ.md) | `#### Authoritative Live Verification Receipt (vX.Y.Z)` | Live verification receipt header |
| [`docs/VERSION_REGISTRY.md`](VERSION_REGISTRY.md) | `node scripts/bump-version.mjs X.Y.Z` | Version registry example |
| [`CHANGELOG.md`](../CHANGELOG.md) | `## [X.Y.Z] — YYYY-MM-DD` | Release notes history |

---

## 🔒 Immutable Historical Archives (Never Modified on Bumps)

Files in versioned subdirectories represent sealed, point-in-time historical audit records and must **not** be modified during version bumps:

- **`docs/1.2.0/`**: Sealed audit and verification records for v1.2.0 (`FINAL_VERIFICATION_AUDIT_v1.2.0.md`).
- **`docs/2.0.0/`**: Sealed audit and diagnostic reports for v2.0.0.
- **`docs/2.1.0/`**: Sealed remediation and anti-regression audit reports for v2.1.0 (`REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md`, `SYSTEM_ARCHITECTURE_v2.1.0.md`, etc.).
- **`BASELINE_v2.1.0.json`**: Sealed reference baseline JSON for v2.1.0 regressions.
- **`BASELINE_v2.2.0.json`**: Sealed reference baseline JSON for v2.2.0 release comparisons.
- **`BASELINE_v2.2.1.json`**: Sealed reference baseline JSON for v2.2.1 release comparisons.
- **`BASELINE_v2.3.0.json`**: Sealed reference baseline JSON for v2.3.0 release comparisons.
