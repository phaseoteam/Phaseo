-- Applied wallet charges by workspace and debit time: budgets count each one whose request row
-- has not landed (private.unbilled_spend).
-- Its own migration, so the SHARE lock it takes on gateway_request_charges (blocking writes, not
-- reads) lasts only for this build.
CREATE INDEX IF NOT EXISTS gateway_request_charges_applied_cost_idx ON public.gateway_request_charges USING btree (workspace_id, created_at) INCLUDE (request_id, key_id, cost_nanos)
  WHERE ((status = 'applied'::text) AND (cost_nanos > 0));
