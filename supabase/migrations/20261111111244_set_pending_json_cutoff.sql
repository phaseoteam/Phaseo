SET LOCAL lock_timeout = '10s';

-- Turn on the billing cutoff that 20261110140719_billing_cutoffs.sql left NULL.
--
-- From this marker, readers count a pending-reconciliation gateway_requests row only by
-- expected_cost_nanos, and no longer by its JSON accounting_finalization.billing_status. Rows
-- created before the marker still count by either.
--
-- Why it is safe now (checked in production on 2026-11-11):
-- * #3547 (with #3633) deployed the gateway that sets expected_cost_nanos on every pending row
--   (main CI, all gateway Workers: api, EU, US). #3536's deploy finished at 00:20 UTC.
-- * The only writers of the JSON-only flag are in the request pipeline (pipeline/after), which
--   runs in those gateway Workers. phaseo-jobs has no cron triggers and no fetch handler, and
--   the realtime relay sends billing_status to clients only; neither writes the flag.
-- * No gateway_requests row since 2026-11-03 has the JSON flag without expected_cost_nanos, so
--   no row changes how it is counted.
--
-- The marker is the time the second deploy finished, not now(), so a replay gives the same
-- value. A marker set since is kept.
-- One row in a private table that only this marker uses: no hot table is locked.
UPDATE "private"."billing_cutoffs"
SET "pending_json_cutoff" = '2026-11-11 00:21:00+00'
WHERE "singleton" AND "pending_json_cutoff" IS NULL;
