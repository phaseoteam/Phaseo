-- Small covering index for bounded public retention refreshes. Production can
-- prebuild this concurrently; IF NOT EXISTS reconciles that index with the ledger.
set local lock_timeout = '500ms';
set local statement_timeout = '10s';
create index if not exists v2_request_facts_success_reporting_time_idx
  on public.v2_request_facts (occurred_at)
  include (workspace_id, routed_model_slug, requested_model_slug)
  where success is true;
