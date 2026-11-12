-- Standalone concurrent build: gateway request ingestion must remain writable.
-- Lists only BYOK request facts whose request-level metadata has not been redacted yet,
-- so the retention job scans pending BYOK rows instead of every old request.
CREATE INDEX CONCURRENTLY IF NOT EXISTS v2_request_facts_byok_retention_idx ON public.v2_request_facts USING btree (occurred_at, request_event_id) WHERE (byok AND (NOT (safe_metadata ? 'retention_redacted_at'::text)));
