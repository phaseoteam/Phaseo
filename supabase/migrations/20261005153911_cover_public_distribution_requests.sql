-- Standalone concurrent build: gateway request ingestion must remain writable.
CREATE INDEX CONCURRENTLY v2_request_facts_public_distribution_idx ON public.v2_request_facts USING btree (occurred_at) INCLUDE (request_event_id, workspace_id, edge_country);
