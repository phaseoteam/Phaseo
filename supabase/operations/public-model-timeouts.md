# Public model query timeouts

The 6 October incident included timeouts in model performance, token trajectory,
monitor, gateway context and analytics RPCs, followed by an unclean database
restart at 13:50:50 UTC. These changes reduce avoidable query work; they do not
establish the infrastructure cause of that restart.

## Changes

- Index the exact `coalesce(routed_model_slug, requested_model_slug,
  requested_model_input)` expression used by public model RPCs. Existing indexes
  cover different expressions, leaving model selection as a post-scan filter.
- Keep the overview's original hourly range comparisons, including their
  behavior across daylight-saving transitions. The expression index reduces
  the number of requests processed without changing bucket semantics.
- Read trajectory token quantities directly. Preserve provider-prefixed model
  IDs, release boundaries, explicit totals, zero-total fallback and per-request
  meter aggregation without building and decoding usage JSON.
- Return a direct or alias model match before evaluating provider-route fallbacks.
  Preserve precedence, invoker permissions and existing grants.
- Keep the cleanup schedule and active state, but use 500 candidates per table,
  a 10-second statement timeout and a 500-ms lock timeout. Retention remains 90
  days. A timeout rolls back that run; monitor failures and retention lag rather
  than assuming a smaller batch guarantees progress.

The gateway covering index was valid on all ten leaf partitions. A representative
monthly key count used that index, but still needed roughly 7,100 heap fetches.
This patch reduces competing work; it does not replace key limit accounting with
eventually consistent analytics or disable limits.

## Verification

Use PGlite 0.5.8 from an external installation:

```powershell
$env:PGLITE_MODULE = '<file URL to @electric-sql/pglite/dist/index.js>'
node supabase/tests/public-model-timeouts.test.mjs
```

The test compares production definitions with the migration at fixed transaction
time in UTC and Asia/Kolkata, plus a fixed New York daylight-saving fallback.
It covers missing models, empty history, exact
boundaries, routed/requested/input fallback, repeated token meter sequences,
explicit zero totals, provider IDs, resolver precedence, grants and permission
denials. It also checks indexed model selection and the cron command through a
local adapter, including disabled and absent jobs.

The forward SQL was generated from the desired definitions in disposable
[CI run 37482819328](https://github.com/phaseoteam/Phaseo/actions/runs/37482819328).
Review replaced the generated resolver drop with `CREATE OR REPLACE` to retain
dependent objects, and replaced cleanup unschedule/reschedule with `alter_job`
to retain the destination's active state. Deployment limits and a validity check
protect reuse of the online index build. Full schema equivalence and replay run
in CI; local generation/check cannot run without Docker or Podman.

## Production rollout

Apply only after production migration approval. Do not run the fixture SQL as
part of deployment and do not invoke cleanup manually.

1. Inspect existing indexes for the name below, definition and `indisvalid`.
   If an interrupted concurrent build left an invalid index, review it before
   retrying; `IF NOT EXISTS` is not a validity check.
2. Prebuild the index outside a transaction using a direct/session connection:

```sql
create index concurrently v2_request_facts_resolved_model_time_idx
  on public.v2_request_facts
  ((coalesce(routed_model_slug, requested_model_slug, requested_model_input)), occurred_at desc);
```

3. Apply `20261006145526_optimize_public_model_timeout_queries.sql` in a
   transaction. Its normal index creation is skipped when the valid online
   build exists. Lock acquisition is capped at 500 ms and statements at 15 s.
4. Confirm index validity, retained function grants and cleanup command. Compare
   representative RPC results and `EXPLAIN (ANALYZE, BUFFERS)` plans. Track
   timeouts by RPC, gateway latency, cleanup status and retention lag.

The expression index adds storage and insertion overhead. Rollback restores the
three prior RPC definitions from the reviewed fixture and the prior cleanup
command (`select public.prune_byok_request_metadata(90, 10000);`), keeping its
schedule and active state. Drop the new index separately if necessary.
No request rows or financial state are changed by the migration itself.

For the restart, inspect Supabase infrastructure events and CPU, memory and disk
metrics around 13:50 UTC, and contact support if the platform events do not
explain the unclean interruption. SQL logs alone do not identify an OOM or host
failure.
