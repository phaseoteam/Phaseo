# Artificial Analysis benchmarks

`pnpm data:sync-artificial-analysis` fetches every free V2 API page and imports Intelligence, Coding, Agentic, and total evaluation cost in USD into Supabase. Results retain source ID, index version, tested configuration, source link, and timestamp. Null metrics are omitted; zero is a score.

## Running

Set `ARTIFICIAL_ANALYSIS_API_KEY` in the environment, root `.env.local`, `.env`, or `apps/web/.env.local`. The daily workflow loads it from the `prod` Infisical environment at `/operations` using OIDC. Database access requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

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

The free API has a 100-request daily quota; each page costs one request. See the [API documentation](https://artificialanalysis.ai/data-api/docs) for licensing and source details.

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
unexpected majors, mixed methodologies, and a missing metric instead of guessing
completion from whichever version has the highest row. A shared table lock keeps
legacy per-model writers from changing that evidence during capture. If the
precondition fails, reconcile and verify the import before deployment.

Rollback application code only; retain snapshot history and the additive schema.
After deployment, verify the coverage RPC, the bootstrap publication and one
manual dry run before allowing the next scheduled write. Full methodology history
is retained in snapshot payloads; the public version picker currently exposes
major versions only. Other model/ranking surfaces still require migration from
their v4-specific display defaults.
