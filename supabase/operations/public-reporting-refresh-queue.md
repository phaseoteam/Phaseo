# Bounded public reporting refreshes

The historical leaderboard cron requeued every fact from the last 90 days,
including already completed analytics work. Keep that job disabled: the
gateway's existing V2 outbox worker already updates the leaderboard rollups.
Its backlog and watermark must be checked separately from this queue.

User counts and workspace return rates now refresh only dirty UTC periods.
Fact inserts, corrections, deletions, usage-meter changes and authoritative
free-variant metadata corrections mark their affected days/weeks. Signals
coalesce into a private default-deny queue. No scan runs inside ingestion.

One bucket runs every five minutes, with a ten-second statement timeout and
500ms lock timeout. A failed publication preserves the last good result and
backs off for two hours, even if new traffic arrives. Successful publication
acknowledges only the selected generation, retaining changes committed during
the scan. The worker does not lock a queue row during its source scan.

User identity, tokens, free variants, success filters, workspace hashes and
public RPC response contracts are preserved. UTC end boundaries are exclusive;
refreshing one period cannot erase the next period. The user report reads facts
and usage directly, avoiding full compatibility-row JSON, pricing and attempts.
The workspace report has a narrow success-only covering time index.
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
select report, bucket_start, requested_at, retry_after, last_error_code
from private.public_reporting_refresh_queue order by retry_after;

select start_time, end_time, status, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'public-reporting-refresh-queue')
order by start_time desc limit 10;

select status, count(*), min(occurred_at) as oldest
from public.v2_analytics_outbox where status <> 'complete' group by status;

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
