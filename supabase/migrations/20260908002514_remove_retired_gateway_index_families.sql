-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- phaseo:allow-production-history-backfill reason: Version 20260908002514 is already applied in production; restore its recorded SQL without replaying it.
-- Original version and SQL are retained; this migration is already applied in production.

-- Retire pre-V2 analytics indexes and covered model/upstream prefixes.
-- Current log/lookup paths retain their indexes; unique/FK indexes remain.
-- Dropping the parent removes its attached children and avoids recreating
-- retired indexes on each future partition.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DROP INDEX public.idx_gateway_requests_model_created;
DROP INDEX public.gateway_requests_canonical_model_created_provider_idx;
DROP INDEX public.gateway_requests_canonical_provider_created_idx;
DROP INDEX public.gateway_requests_requested_provider_created_idx;
DROP INDEX public.gateway_requests_routed_provider_created_idx;
DROP INDEX public.gateway_requests_usage_tokens_model_created_idx;
DROP INDEX public.gateway_requests_usage_image_model_created_idx;
DROP INDEX public.gateway_requests_usage_audio_model_created_idx;
DROP INDEX public.gateway_requests_usage_reasoning_model_created_idx;
DROP INDEX public.gateway_requests_usage_quad_model_created_idx;
DROP INDEX public.gateway_requests_usage_workload_model_created_idx;
DROP INDEX public.gateway_requests_api_model_created_idx;
DROP INDEX public.gateway_requests_pricing_plan_created_idx;
DROP INDEX public.gateway_requests_trace_data_gin_idx;
DROP INDEX public.gateway_upstream_requests_parent_sequence_idx;
