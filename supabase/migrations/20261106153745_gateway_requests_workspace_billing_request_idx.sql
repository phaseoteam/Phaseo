-- Finds the request row of a stepped stream charge (billing_request_id); partial and small.
-- Built on every partition of gateway_requests.
-- Its own migration, so the SHARE lock it takes on gateway_requests and each of its partitions (blocking writes, not reads)
-- lasts only for this build.
CREATE INDEX IF NOT EXISTS gateway_requests_workspace_billing_request_idx ON public.gateway_requests USING btree (workspace_id, billing_request_id)
  WHERE (billing_request_id IS NOT NULL);
