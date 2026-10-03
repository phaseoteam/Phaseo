# Provider health refresh queue

Each provider attempt previously acquired a daily provider/model lock and
recomputed all attempts in that daily bucket inside request ingestion. The new
trigger writes only a durable dirty signal. Repeated signals coalesce; a cron
worker recomputes at most 25 keys per minute, stops between keys after five
seconds, and has a ten-second statement budget. A single slow key can exceed the
five-second soft budget; statement timeout supplies the hard bound.
The worker acknowledges signals only after all scans, so it never holds queue
row locks across another reporting scan. A generation check retains
signals committed during publication. Failed work rolls back its derived-row
changes and retries after five minutes; new signals do not defeat that backoff.

This changes freshness of derived daily reporting, not wallet accounting,
reservations, key/workspace limits or the live routing circuit breaker.
Normal reporting refresh starts on the next minute tick. A backlog, timeout or
failed job increases delay. No historical backfill runs during deployment;
untouched historical buckets retain their existing values.

Inspect backlog and cron results as the database operator:

```sql
select count(*) as pending,
  clock_timestamp() - min(requested_at) as oldest_last_signal_age,
  count(*) filter (where last_error_code is not null) as retrying
from private.provider_health_refresh_queue;

select usage_date, model_slug, provider_model_id, requested_at, retry_after, last_error_code
from private.provider_health_refresh_queue order by retry_after limit 20;

select status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'provider-health-refresh-queue')
order by start_time desc limit 10;
```

The queue is private and default-deny. Only trusted triggers and the operator's
worker can enqueue. Service role may execute the drain function, but cannot
directly access queue rows. Drain calls serialize through a worker-only advisory
lock; ingestion does not take that lock.

If scans still overload the database, disable this job with `cron.alter_job`.
Dirty signals remain durable and reporting becomes stale; request ingestion
continues. Do not restore the old per-attempt scan during an overload incident.
Full rollback requires restoring the prior function/insert trigger and dropping
the new fact trigger, after stopping the worker. Queue/helper removal is optional
and must follow review of pending signals. Source requests and billing are never
modified by the worker.

Run the focused fixture with `PGLITE_MODULE` pointing at the installed PGlite
module, then `node supabase/tests/provider-health-refresh-queue.test.mjs`.
Fixtures compare every published bucket against raw attempts, including retries,
updates, fact moves, deletion cascades, failed publication and a generation race.
PGlite does not validate real multi-session lock contention or pg_cron execution;
check actual job results and queue progression after production rollout.
