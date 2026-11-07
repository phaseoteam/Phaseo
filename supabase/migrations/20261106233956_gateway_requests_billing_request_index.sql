SET LOCAL lock_timeout = '10s';

-- Look up a request row by its wallet charge key (gateway_request_charges.request_id),
-- for refund claims and budget usage that count charges without a request row.
-- On the partitioned parent this builds the index on every partition under a brief
-- SHARE lock on each (writes wait while it builds; about 290k rows in production).
create index if not exists gateway_requests_workspace_billing_request_idx
  on public.gateway_requests (workspace_id, billing_request_id)
  where billing_request_id is not null;
