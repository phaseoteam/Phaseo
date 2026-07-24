# @phaseo/data-catalog

Canonical Phaseo data lives in `src/data`.

- Models
- Providers
- Organisations
- Benchmarks
- Pricing

The web app and automation scripts reference this directory as the single source of truth.

JSON files are the authoring format for pull requests, review, and issue
discussion. The web importer writes the compatibility `data_*` tables from this
directory and then synchronises the additive `v2_*` catalogue mirror. Runtime
queries should move to the v2 tables only after the mirror and reconciliation
checks are healthy.

The structural contract is documented in [`schema/catalog.schema.json`](schema/catalog.schema.json).
The TypeScript validator remains responsible for cross-file references and
normalisation rules that JSON Schema cannot express.

Provider records may be catalogue-only. Gateway and aggregator entries such as
OpenRouter, Vercel AI Gateway, Cloudflare AI Gateway, GitHub Models, Requesty,
and the router services seeded from models.dev are explicitly marked with
`gateway_kind` and `routable: false`; they describe external availability and
are not Phaseo routing offers. A provider becomes routable only through an
explicit reviewed JSON change and route import.

models.dev is an enrichment source, never a runtime database writer or a source
of canonical model identities. Refresh its provider support snapshot explicitly
with `pnpm --filter @phaseo/web catalog:enrich:models-dev`, review the resulting
JSON diff, and then run the normal importer. The enrichment command only maps
models that already resolve through a canonical model JSON file, an enabled
alias, or an existing provider model slug; unmatched upstream records are
reported and skipped.
