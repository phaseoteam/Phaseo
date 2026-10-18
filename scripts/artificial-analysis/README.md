# Artificial Analysis benchmarks

## Public page extractor

`pnpm exec tsx scripts/scrape-artificial-analysis-public.ts --output snapshot.json`
reads the public `/models` HTML without an API key and writes a reviewable JSON
snapshot. It extracts embedded model UUIDs, configurations, Intelligence Index
scores, total token counts, output tokens per task, costs, timings, and individual
Intelligence Index evaluation scores. Field names and units remain explicit;
individual evaluation scores retain their source scales, including negative scores.

Use `--url https://artificialanalysis.ai/models/<slug>` for a public model page,
or `--input saved.html` to parse a saved response. The output file must not exist.
Snapshots include the source URL, HTML SHA-256, detected methodology versions,
and extraction time. Saved HTML has an unknown fetch time (`fetchedAt: null`).

Coverage is **page selection only**, not the entire AA catalogue. In the initial
live check, the page embedded 27 configurations with 270 individual evaluation
scores. Model detail pages and query parameters can still embed the same default
comparison set; requesting a URL does not guarantee that model is present. Match
the returned UUIDs before using any record. Missing fields remain null, and page
format changes or conflicting rows fail extraction. The script parses JSON;
it never executes downloaded JavaScript or calls private APIs.

This command makes one public page request, does not crawl automatically, and
does not modify the database or the scheduled API import. Review coverage and
methodology before adding a publication/import path. Preserve attribution to
[Artificial Analysis](https://artificialanalysis.ai/models) in downstream displays.

Tests: `pnpm exec tsx --test scripts/artificial-analysis/public-page.test.ts`.

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
