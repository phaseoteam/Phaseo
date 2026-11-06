-- A batch's per-row request rows (batch_usage:<batch>:<row>, batch_hold_usage:<reservation>:<n>) by
-- batch identity: budgets reconcile each batch debit against them whenever they were written
-- (private.unbilled_spend). text_pattern_ops because the database collation is not C, so prefix
-- ranges need byte order; partial, so it holds batch rows only. Built on every partition.
-- Its own migration, so the SHARE lock it takes on gateway_requests and each of its partitions
-- (blocking writes, not reads) lasts only for this build.
CREATE INDEX IF NOT EXISTS gateway_requests_batch_rows_idx ON public.gateway_requests USING btree (workspace_id, request_id text_pattern_ops) INCLUDE (cost_nanos)
  WHERE ((request_id ~>=~ 'batch'::text) AND (request_id ~<~ 'batci'::text));
