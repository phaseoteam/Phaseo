# Artificial Analysis benchmarks

`pnpm data:sync-artificial-analysis` reads every page of the free V2 language model endpoint. It imports Intelligence, Coding, Agentic and the total Intelligence Index evaluation cost in USD. Per-task cost and the tested model/effort, source ID and index version are preserved in result provenance. Null metrics are omitted; zero is a real score. Other benchmarks remain intact.

## Setup

Set `ARTIFICIAL_ANALYSIS_API_KEY` in the root `.env.local` (or `.env` or `apps/web/.env.local`) for local use and in GitHub Actions repository secrets for the daily workflow. Existing process environment values take priority, followed by the web app file and then the root files. Do not put the key in mappings or client code.

```sh
pnpm data:sync-artificial-analysis --report=artificial-analysis-report.json
pnpm data:sync-artificial-analysis --write --report=artificial-analysis-report.json
pnpm data:sync-manifest
pnpm validate:data
```

The workflow runs at 04:23 UTC daily and writes benchmark results directly to
the database. It never auto-merges or imports repository JSON. The separate
catalog snapshot workflow publishes the resulting public data as a reviewable
PR. Existing `PHASEO_APP_CLIENT_ID` and `PHASEO_APP_PRIVATE_KEY` repository
secrets provide PR access. Failed pulls stop before changing benchmark data; the
matching report is a workflow artifact.

To inspect database-only matches without writing, add `--sync-db` to the dry run. For an immediate database backfill, `--write --sync-db` additionally uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. This also examines database-only models, paginates all database rows, and only replaces the four managed metrics for successfully matched models. Obsolete database scores are withdrawn by setting their scores and ranks to null, respecting the database retention policy. The public snapshot workflow reflects the updated database on its next run. Public caches refresh on their normal TTLs.

## Matching

Automatic matching requires the same creator, agreement between the source slug and name, and an exact catalog ID/name after removing punctuation and case. It does not remove dates, quantization, or reasoning-effort suffixes. Ambiguous matches and sources matching multiple catalog records are skipped unless explicitly mapped, never selected by highest score. Each source may have only one explicit mapping; its automatic matches to other catalog aliases are skipped. Explicit mappings document the tested configuration and select its canonical catalog entry.

Review unmatched models and source IDs in the report, then add canonical Phaseo IDs to `mappings.json`:

```json
{
  "models": { "openai/example-model": "stable-aa-model-uuid" },
  "creators": { "x-ai": "xAI" }
}
```

Use a `null` model mapping to opt out of future updates (existing records are retained). Creator mappings accept an AA creator ID or name. Incorrect/stale explicit mappings fail the entire run. Database-only mappings require `--sync-db`; add the model to the canonical catalog before using that mapping in the scheduled workflow.

Unmatched records retain previous scores and their original provenance. Coverage is limited to models evaluated by Artificial Analysis; no scores are inferred for untested models. Major index version changes fail closed until a new benchmark family is added, so incompatible versions are not mixed. Minor versions remain recorded on each result, not in a global label that would relabel older data.

Each result persists its snapshot time as `updated_at` through the database sync. Writes update only the benchmarks property, preserving unrelated model formatting.

The free API has a 100-request daily quota; each page costs one request. We fetch a single snapshot per run, not one request per model. Attribution is displayed in the featured benchmark panel. See [API documentation and licensing](https://artificialanalysis.ai/data-api/docs) for use and redistribution terms.

## Display and attribution

Model pages feature all four metrics with the exact tested configuration and source link. Rankings show the latest available index version; benchmark detail pages allow selecting older versions without mixing their scores. Evaluation cost is always formatted as USD and ranked lower-first. Other benchmarks remain searchable.

The unmodified light/dark SVG marks in `apps/web/public/benchmarks` come from the [official Artificial Analysis brand kit](https://artificialanalysis.ai/brand-kit) ([SVG archive](https://artificialanalysiscdn.com/brand-kit/aa_icon_logo_svg.zip)), retrieved 7 September 2026.
