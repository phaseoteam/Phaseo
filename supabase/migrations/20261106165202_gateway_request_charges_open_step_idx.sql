-- The applied, not yet final stepped stream charges budgets count until their request row lands.
-- Its own migration, so the SHARE lock it takes on gateway_request_charges (blocking writes, not reads)
-- lasts only for this build.
CREATE INDEX IF NOT EXISTS gateway_request_charges_open_step_idx ON public.gateway_request_charges USING btree (workspace_id, request_id) INCLUDE (key_id, created_at, cost_nanos)
  WHERE ((is_final IS FALSE) AND (status = 'applied'::text) AND (cost_nanos > 0));
