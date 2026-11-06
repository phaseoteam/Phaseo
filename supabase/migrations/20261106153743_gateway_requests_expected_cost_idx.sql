-- Delivered requests whose wallet charge is pending reconciliation (expected_cost_nanos), which
-- budgets count until charged; partial and small. Built on every partition of gateway_requests.
-- Its own migration, so the SHARE lock it takes on gateway_requests and each of its partitions
-- (blocking writes, not reads) lasts only for this build.
CREATE INDEX IF NOT EXISTS gateway_requests_expected_cost_idx ON public.gateway_requests USING btree (workspace_id, created_at) INCLUDE (key_id, cost_nanos, expected_cost_nanos)
  WHERE (expected_cost_nanos IS NOT NULL);
