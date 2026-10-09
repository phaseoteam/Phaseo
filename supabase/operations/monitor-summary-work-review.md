# Public statistics and rollup work reduction

Draft implementation prepared on 9 October 2026. It has not been deployed.

## Evidence and first change

The production log sample from 16:12–17:12 BST contained 14 statement timeouts.
Twelve involved `get_monitor_model_rows` / `get_public_monitor_rows_payload`:
eleven model resolution paths and one usage-token calculation. This identifies
a repeated source of query failures, not the cause of every database spike.

`get_monitor_model_rows` currently resolves missing canonical model IDs for
individual requests across its seven-day window. The draft groups requests by
canonical ID, supplied model ID and provider before resolving each group. It
keeps token sums and separate non-null counts for throughput and latency, then
combines resolved groups. This preserves weighted averages when several aliases
refer to the same model.

Provider-specific resolution, canonical-ID precedence, unknown-provider handling,
raw seven-day boundaries, hidden-model filtering, pricing, metadata and grants
are retained. There are no table, index, scheduler or financial-record changes.
The compatibility view still reads request usage for the seven-day window;
this patch removes repeated resolution but does not eliminate that scan.

## Shared public cache

Public rankings use the existing Workers Cache with fifteen minutes of freshness,
fifteen minutes of stale serving during refresh, and up to an hour of stale
serving on backend error. Browser HTTP freshness remains zero. Existing cache
tags and purge endpoints are retained. Anonymous simultaneous misses for
rankings, model sections and landing statistics are coalesced within a Worker
isolate. Completed responses are not kept in a second local cache. Credentialed
reads and writes bypass this coalescing; private account routes are unaffected.

## Covered rollup events

The processor still rebuilds exact private daily, public daily and public hourly
totals from their existing sources. It now locks and acknowledges additional
ready outbox events whose complete workspace/hour/dimension identity is already
represented in its seed batch. This does not add new summary groups to rebuild.
Acknowledgments are capped at eight times the seed limit and 2,000 overall.
The original `selected` count is preserved; `coalesced` reports extra covered
events. Not-yet-available events and other workspace identities remain queued.

A transaction advisory lock prevents overlapping processors from rebuilding the
same summaries. Captured outbox row locks let corrections re-enqueue after commit,
including upserts that would have done nothing while the row was still pending.
Acknowledgment requires `processing` status, preserving re-enqueues during a run.
Any failure rolls back the rebuild and acknowledgments together. Former-grain
repairs continue to use the same reserved slots and row locks.

## Local verification

`supabase/tests/monitor-model-rows.test.mjs` compares all output fields against
the frozen prior function using PGlite 0.5.8 and the actual model resolver and
token helper. It checks aliases, provider IDs, canonical overrides, multiple
capabilities, hidden models, free pricing, expired pricing, exact time boundaries,
null measurements and zero usage.

With 20,000 additional requests using existing identifiers, resolver calls fell
from 20,021 to 21. The instrumented local comparison took about 1,079 ms before
and 353 ms after. These synthetic timings are not production benchmarks or
estimates of infrastructure cost savings. Every returned field matched.
Adding requests did not increase the grouped query's resolver-call count.

Run with an external PGlite installation:

```powershell
$env:PGLITE_MODULE = '<file URL to @electric-sql/pglite/dist/index.js>'
node supabase/tests/monitor-model-rows.test.mjs
```

The regression is also registered in declarative-schema CI.

`analytics-outbox-coalescing.test.mjs` compares every rollup field and meter with
the prior processor. For 3,000 requests plus boundary cases, worker passes fell
from thirteen to three and summary rebuilds from thirty-nine to nine. It covers
the cap, different workspaces, readiness, public visibility, corrections during a
rebuild, moved identities, empty-run idempotency and grants.

Web API validation passed: forty-nine focused tests, lint/typecheck (four existing
file-length warnings), SDK build and the production Worker dry run. No public API
request or response shape changed.

## Remaining deployment preparation

`pnpm db:schema:sync -- -f reduce_monitor_model_lookups` was attempted. It stopped
because Docker and Podman are unavailable locally. No migration was generated,
and full schema equivalence and baseline replay have not run locally. Generation
and validation will use the repository's existing GitHub disposable runtime.

Generate and review the forward migration using the repository's disposable
runtime, retain the generated dependency manifest, and run `db:schema:check`
and `db:schema:smoke`. Apply only after deployment authorization. Do not apply
the schema file directly through Studio or SQL tools.

After an approved deployment, compare RPC failures and database work over a
representative period. Restore the prior function definition if results regress;
no request data needs to be restored for this function-only change.

## Remaining operational investigation

Identify the producer of the large backlog before replaying more history.
The read-only sample found 113,761 pending events and a concentrated group
of 47,444 still-pending rows created at 13:00–13:59 BST. Older event timestamps
suggest historical processing; its producer has not been proven. A later sample
at 21:32 BST showed 105,473 pending events. No additional historical replay is
part of this change; normal scheduled processing continues.

Keep the current compute tier while measuring these changes. Suppressing errors
or marking follow-ups complete does not demonstrate reduced database work.
