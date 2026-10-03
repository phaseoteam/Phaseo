# Bounded public reporting refreshes

The historical leaderboard cron requeued every fact from the last 90 days,
including already completed analytics work. Keep that job disabled: the
gateway's existing V2 outbox worker already updates the leaderboard rollups.
Its backlog and watermark must be checked separately from this queue. Direct
fact updates and meter mutations now mark their request pending in that outbox,
so ordinary corrections no longer rely on replaying all completed history.
Fact moves and explicit deletions additionally record their former dimensions
in a private queue. Each existing V2 worker call claims one former identity
alongside its ordinary bounded batch and reuses the same metric queries to
recompute both sides, including an old group with no remaining source rows.
The former identity is acknowledged only after successful atomic publication.
Hourly BYOK metadata pruning suppresses both reporting and correction signals
for its duration, including cascaded meters, preserving durable old aggregates.
The transaction-local suppression flag is restored before pruning returns.

User counts and workspace return rates now refresh only dirty UTC periods.
Fact inserts, corrections, deletions, usage-meter changes and authoritative
free-variant metadata corrections mark their affected days/weeks. Signals
coalesce within each transaction into a private default-deny queue. Transactions
use one of 64 lanes per period, spreading contention instead of locking the
same two global day/week tuples. At most 64 signals exist per period, including
during backoff; the worker never materializes an unlimited acknowledgment array.
No scan runs inside ingestion.

One bucket runs every five minutes, with a ten-second statement timeout and
500ms lock timeout. A failed publication preserves the last good result and
backs off for two hours, even if new traffic arrives. Successful publication
acknowledges only the exact signal IDs visible before scanning, retaining changes
committed during the scan, even when an earlier sequence number commits late.
Backoff is stored separately and checked by the worker, so new transactions
cannot defeat it. The worker does not lock a queue row during its source scan.

User identity, tokens, free variants, success filters, workspace hashes and
public RPC response contracts are preserved. UTC end boundaries are exclusive;
refreshing one period cannot erase the next period. The user report reads facts
and usage directly, avoiding full compatibility-row JSON, pricing and attempts.
The workspace report has a narrow success-only covering time index. Both new
index migrations contain a single `CREATE INDEX CONCURRENTLY` statement for
populated environment rollout through the repository's Supabase CLI 2.111.
They are intentionally standalone; do not wrap them in a transaction or apply
through Supabase's separate GitHub branching integration.
The models page's free-router usage summary also has a covering partial index
for `requested_model_input = 'phaseo/free'`, avoiding wide ordinary request
rows when rebuilding its cached catalogue response. Its metric SQL is unchanged.

Freshness is eventual: usually one or two scheduler ticks for today's day and
the current week, longer when historical corrections or failed buckets queue.
Deployment queues today and yesterday only, preserving untouched historical
results. A one-time historical repair must be explicitly scoped and queued in
bounded buckets. Catalogue/provider identity changes that don't modify facts
require explicitly enqueueing the affected reporting periods.

```sql
select report, bucket_start, count(*) as signals, min(requested_at) as oldest
from private.public_reporting_refresh_queue group by report, bucket_start;

select * from private.public_reporting_refresh_backoff;

select start_time, end_time, status, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'public-reporting-refresh-queue')
order by start_time desc limit 10;

select status, count(*), min(occurred_at) as oldest
from public.v2_analytics_outbox where status <> 'complete' group by status;

select count(*), min(queued_at) as oldest from private.v2_analytics_previous_grains;

select rollup_name, max(last_completed_at) as latest
from public.v2_rollup_refresh_state group by rollup_name;
```

Pause by setting the new cron job's `active` to false. Dirty signals remain
durable, and existing results remain readable. Do not reactivate the three
historical rebuild jobs or replay their old commands. Roll back function or
trigger definitions through a forward migration; no source/billing repair is
part of this deployment.

Local regression test:

```text
node supabase/tests/public-reporting-refresh-queue.test.mjs
```

Set `PGLITE_MODULE` to the installed PGlite module URL if it is not resolvable
from this checkout. This fixture checks metric equivalence and generation races;
actual concurrent ingestion and pg_cron execution require live verification.
