SET LOCAL lock_timeout = '10s';

-- Wallet movements of stepped stream charges (gateway_charge_request_total), by workspace and time:
-- budgets count those of a charge whose request row has not landed (private.unbilled_spend).
-- Its own migration, so the SHARE lock it takes on credit_ledger (blocking writes, not reads) lasts
-- only for this build.
CREATE INDEX IF NOT EXISTS credit_ledger_request_charge_movements_idx ON public.credit_ledger USING btree (workspace_id, created_at) INCLUDE (source_ref_id, amount_nanos)
  WHERE ((ref_type = 'gateway_request_charge'::text) AND (source_ref_type = 'gateway_request'::text) AND (status = 'applied'::text));
