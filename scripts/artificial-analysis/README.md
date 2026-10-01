# Artificial Analysis benchmarks

`pnpm data:sync-artificial-analysis` fetches every free V2 API page and imports Intelligence, Coding, Agentic, and total evaluation cost in USD into Supabase. Results retain source ID, index version, tested configuration, source link, and timestamp. Null metrics are omitted; zero is a score.

## Running

Set `ARTIFICIAL_ANALYSIS_API_KEY` in the environment, root `.env.local`, `.env`, or `apps/web/.env.local`. The daily workflow loads it from the `prod` Infisical environment at `/operations` using OIDC. Database access requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

```sh
pnpm data:sync-artificial-analysis --report=artificial-analysis-report.json
pnpm data:sync-artificial-analysis --write --report=artificial-analysis-report.json
```

Dry runs validate the full source and live catalog without changing scores. The workflow runs at 04:23 UTC daily and publishes its matching report. The separate catalog snapshot workflow reflects database updates; archived JSON is never an input.

## Database mappings

Set `v2_models.metadata.external_ids.artificial_analysis` to the stable AA UUID. Model mappings are owned by the database; changing one needs no code PR. See [source ID instructions](../benchmark-source-ids.md) for both AA and Epoch.

An explicit AA ID selects the evaluated family and retains its reasoning configurations. A configuration with its own mapped or automatically matched canonical model stays attached to that model. Duplicate ownership, malformed IDs, and IDs absent from the fetched source stop the import before writes.

When the key is absent, automatic matching requires creator agreement and a unique normalized model name/ID with matching source slug and name. It preserves dates, quantization, and reasoning suffixes. Creator aliases live in `creators.json`. Explicit JSON `null` disables updates from this source.

Unmatched, ambiguous, and disabled models retain previous scores and provenance. Successful matches replace only the four managed metrics; obsolete scores are withdrawn using `effective_to`. Higher Intelligence/Coding/Agentic is better; lower USD cost is better. Major index versions are stored separately.

The free API has a 100-request daily quota; each page costs one request. See the [API documentation](https://artificialanalysis.ai/data-api/docs) for licensing and source details.
