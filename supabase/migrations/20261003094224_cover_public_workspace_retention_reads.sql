-- Single standalone statement: the repository's Supabase CLI 2.111 handles
-- CONCURRENTLY outside a transaction. Populated environments keep accepting
-- writes throughout the build; existing production indexes are reused.
create index concurrently if not exists v2_request_facts_success_reporting_time_idx
  on public.v2_request_facts (occurred_at)
  include (workspace_id, routed_model_slug, requested_model_slug)
  where success is true;
