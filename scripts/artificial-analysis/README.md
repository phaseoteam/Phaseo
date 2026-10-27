# Artificial Analysis benchmarks

## Full frontend data extractor

`pnpm exec tsx scripts/scrape-artificial-analysis-public.ts --output snapshot.json`
loads the public models page, discovers its full-model data manifest, and fetches
that versioned frontend data asset. It uses the same public decoding format as
AA's unauthenticated browser. No API key or browser automation is needed; no
downloaded JavaScript is executed. The manifest path is discovered on every run.

The default 27 HTML rows are **not** the extraction scope. The live frontend
asset contained **704 distinct AA configurations**, including 216 with benchmark
token totals and per-task token usage, 2,160 Intelligence Index evaluation scores,
and 8,742 non-null standalone benchmark score fields. Missing metrics remain
null. Individual scores preserve source scales and source field names; this
extractor does not invent benchmark IDs or normalize incompatible scales.

Each snapshot records source/data URLs, HTML and data SHA-256 hashes, detected
methodology versions, and fetch/extraction times. `--input saved.html --data
saved-data.txt` supports offline replay; saved inputs have unknown fetch time.
Saved HTML requires an explicit `--url` to preserve source provenance.
Output files are created exclusively. Invalid identities, duplicates, broken
manifests, authentication failures in the data envelope, and changed schemas
abort extraction. Corrupt or partial data is not published.

### Catalogue matching

Add `--match-db` with the existing maintenance Supabase environment variables
(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). This reads every
`v2_models` row in ordered pages, uses the existing database AA UUID mappings,
creator aliases and configuration-family matcher, and adds a bidirectional
matching report to the JSON snapshot. It never writes to the database.

The live audit matched 601 of 704 AA configurations to 419 Phaseo catalogue
models. Another 103 configurations remained unmatched; five catalogue models
were ambiguous. The report includes source UUIDs, candidate UUIDs, and unmapped
source names so those cases can be reviewed instead of guessed. Counts are a
point-in-time audit, not fixed completeness thresholds.

The command makes two public requests plus optional catalogue reads. It does
not modify the scheduled API import. Before publication, review unmatched IDs,
benchmark metadata/scales, and methodology compatibility. Preserve attribution
to [Artificial Analysis](https://artificialanalysis.ai/models).

### Database storage and page access

After deploying the schema migration, add `--write --match-db` to publish a fresh
full snapshot. Saved HTML/data cannot be published. Each publication retains all
source configurations, raw source records, provenance, and the source-to-catalogue
mapping. The service-only `artificial_analysis_public_snapshots` table is append-only;
the publisher validates identities and ownership, rejects stale methodology/data,
and treats identical content as a no-op. The existing four-metric API import and
its history remain separate. The existing hourly benchmark workflow runs this
publisher in an independent job, alongside the core API import. Both jobs also
run on manual workflow dispatch. Failure of either job is visible without
preventing the other from running. The public importer needs the database secrets
but no AA API key; its two public requests do not use the free API quota.

The full snapshot is written to the runner's temporary directory, not uploaded as
a public artifact, because its matching report can contain non-public catalogue
identities. Extraction, validation or publication failures retain the previously
published snapshot and fail the job. Check the `public_snapshot` job when the
dashboard's snapshot date stops advancing; a green core `sync` job alone does not
confirm rich-data freshness. Identical data is a no-op, so its original fetch date
remains until the source data or catalogue matching changes.

`GET /api/_web/benchmarks/artificial-analysis/data` returns a bounded page of
matched, currently visible catalogue configurations. It accepts `model` (canonical
model slug), `version` (major), `limit` (1–200), and `offset`. The response includes
the snapshot ID, methodology version and fetch time. Raw source records and the
unmatched/ambiguous matching report never leave the server through this route.
The server fetcher `fetchFrontendArtificialAnalysisData` provides the typed page
contract. Missing publication returns 404; an unavailable storage RPC returns 503.

Stored/displayable fields include benchmark and domain capability scores, token
totals and weighted per-task token use, costs and timing, price/cache rates,
performance measurements, context/parameter/modality/licensing details, openness
and available evaluation breakdowns. Raw upstream fields remain available in the
private snapshot for future reviewed display additions.

`methodology_version` identifies the Intelligence Index, not the independent
versions of every evaluation or domain capability index. The frontend dataset
does not supply all those versions. Preserve each source metric's scale and
snapshot provenance; do not label domain scores with the Intelligence Index
version or combine historical domain scores into a trend without their version
definitions. AA performance/pricing measurements also have different semantics
from benchmark-task timing/cost and must keep their distinct field names.

Storage contract test: `node supabase/tests/artificial-analysis-public-data.test.mjs`.

Tests: `pnpm exec tsx --test scripts/artificial-analysis/public-page.test.ts
scripts/artificial-analysis/core.test.ts`.

`pnpm data:sync-artificial-analysis` fetches every free V2 API page and imports Intelligence, Coding, Agentic, and total evaluation cost in USD into Supabase. Results retain source ID, index version, tested configuration, source link, and timestamp. Null metrics are omitted; zero is a score.

## Running

Set `ARTIFICIAL_ANALYSIS_API_KEY` in the environment, root `.env.local`, `.env`, or `apps/web/.env.local`. The hourly workflow loads it from the `prod` Infisical environment at `/operations` using OIDC. Database access requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

```sh
pnpm data:sync-artificial-analysis --report=artificial-analysis-report.json
pnpm data:sync-artificial-analysis --write --report=artificial-analysis-report.json
```

Dry runs validate the full source and live catalog without changing scores. The workflow runs hourly at minute 23 UTC and publishes its matching report. The separate catalog snapshot workflow reflects database updates; archived JSON is never an input.

## Database mappings

Set `v2_models.metadata.external_ids.artificial_analysis` to the stable AA UUID. Model mappings are owned by the database; changing one needs no code PR. See [source ID instructions](../benchmark-source-ids.md) for both AA and Epoch.

An explicit AA ID selects the evaluated family and retains its reasoning configurations. A configuration with its own mapped or automatically matched canonical model stays attached to that model. Duplicate ownership, malformed IDs, and IDs absent from the fetched source stop the import before writes.

When the key is absent, automatic matching requires creator agreement and a unique normalized model name/ID with matching source slug and name. It preserves dates, quantization, and reasoning suffixes. Creator aliases live in `creators.json`. Explicit JSON `null` disables updates from this source.

Unmatched, ambiguous, and disabled models retain previous scores and provenance. Successful matches replace only the four managed metrics; obsolete scores are withdrawn using `effective_to`. Higher Intelligence/Coding/Agentic is better; lower USD cost is better. Major index versions are stored separately.

The free API allows 100 requests per 24-hour window, shared by the user or organization; each page costs one request. Hourly runs fit only while a full import takes at most four pages (96 requests, leaving four for manual runs). If pagination or other usage exceeds that budget, reduce the schedule or use a higher-quota plan. The 100-page per-run safety limit does not enforce a shared daily budget. A rate-limit error aborts the import before database writes. See the [API documentation](https://artificialanalysis.ai/data-api/docs) for licensing and source details.

## Atomic publication and history

The importer sends one complete payload to `publish_artificial_analysis_snapshot`.
Postgres publishes the four benchmark definitions, matched scores, withdrawals,
and publication record in one transaction. A failed validation or write leaves
the previous publication intact. Publishers serialize on an advisory lock;
older fetches and methodology downgrades are rejected. Repeating the exact
snapshot UUID and payload is a no-op; reusing a UUID for different content fails.

`artificial_analysis_snapshots` retains each published import payload with its
methodology and fetch timestamp. Service-role callers can read and insert
snapshots but cannot update or delete them. Public roles cannot access the
payloads or invoke the publisher. The existing `v2_*` tables remain the compatible
projection for model pages and historical major-version URLs.

`get_artificial_analysis_coverage` counts distinct visible models in SQL and
filters versioned coverage to the latest published methodology. The stable AA
entry selects only majors with a publication record; partially written future
rows and empty metadata placeholders cannot promote a version.

Deploy the generated schema migration and the data-only bootstrap migration
before the new web API and importer. The bootstrap records the existing imported
scores as `existing_catalogue_bootstrap`, without rewriting scores or presenting
them as a fresh upstream fetch. The importer fails without writing anything if
the publisher RPC is not deployed yet. No source import is required to initialize
the existing v4 publication.

The bootstrap is pinned to the verified complete v4.3.2 import. It refuses
future majors, mixed v4 methodologies, and a missing metric instead of guessing
completion from whichever version has the highest row. A shared table lock keeps
legacy per-model writers from changing that evidence during capture. If the
precondition fails, reconcile and verify the import before deployment.
Retained earlier-major scores are preserved and do not initialize publications.

Rollback application code only; retain snapshot history and the additive schema.
After deployment, verify the coverage RPC, the bootstrap publication and one
manual dry run before allowing the next scheduled write. Full methodology history
is retained in snapshot payloads; the public version picker currently exposes
major versions only. Other model/ranking surfaces still require migration from
their v4-specific display defaults.
