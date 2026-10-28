---
"@phaseo/web-api": patch
---

Add small per-page payloads for the website: one model's place on the benchmark leaderboards (`/rankings/benchmarks/:modelId`), an `ids` filter on `/gateway/models`, a `limit` on `/organisations/:id/models`, and slim compare picker options (`/compare/options`). The compare catalogue now reads past the database's 1,000-row limit, so models later in the alphabet appear in the picker again.
