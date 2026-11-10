SET LOCAL lock_timeout = '10s';

-- Budgets count charged requests that did not succeed (a cancelled stream that was billed);
-- partial and small. Built on every partition of gateway_requests.
-- Its own migration, so the SHARE lock it takes on gateway_requests and each of its partitions (blocking writes, not reads)
-- lasts only for this build.
CREATE INDEX IF NOT EXISTS gateway_requests_charged_unsuccessful_cost_idx ON public.gateway_requests USING btree (workspace_id, created_at) INCLUDE (key_id, cost_nanos)
  WHERE ((success IS NOT TRUE) AND (cost_nanos > 0));
