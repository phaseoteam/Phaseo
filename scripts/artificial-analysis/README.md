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

The workflow runs at 04:23 UTC daily and updates a catalog PR. Merging it runs the existing production database importer. It never auto-merges. Existing `PHASEO_APP_CLIENT_ID` and `PHASEO_APP_PRIVATE_KEY` repository secrets provide PR access. Failed pulls stop before changing benchmark data; the matching report is a workflow artifact.

For an immediate database backfill, `--write --sync-db` additionally uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. This also examines database-only models, paginates all database rows, and only replaces the four managed metrics for successfully matched models. Commit/merge the catalog snapshot too so a later catalog import does not restore older scores. Public caches refresh on their normal TTLs.

## Matching

Automatic matching requires the same creator and an exact ID/name after removing punctuation and case. It does not remove dates, quantization, or reasoning-effort suffixes. Ambiguous matches are skipped, never selected by highest score. One AA record may match multiple canonical records where their IDs/names agree.

Review unmatched models and source IDs in the report, then add canonical Phaseo IDs to `mappings.json`:

```json
{
  "models": { "openai/example-model": "stable-aa-model-uuid" },
  "creators": { "x-ai": "xAI" }
}
```

Use a `null` model mapping to opt out of future updates (existing records are retained). Creator mappings accept an AA creator ID or name. Incorrect/stale explicit mappings fail the entire run. Database-only mappings require `--sync-db`; add the model to the canonical catalog before using that mapping in the scheduled workflow.

Unmatched records retain previous scores and their original provenance. Coverage is limited to models evaluated by Artificial Analysis; no scores are inferred for untested models. Major index version changes fail closed until a new benchmark family is added, so incompatible versions are not mixed. Minor versions remain recorded on each result, not in a global label that would relabel older data.

The free API has a 100-request daily quota; each page costs one request. We fetch a single snapshot per run, not one request per model. Attribution is displayed in the featured benchmark panel. See [API documentation and licensing](https://artificialanalysis.ai/data-api/docs) for use and redistribution terms.
