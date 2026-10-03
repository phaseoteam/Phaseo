-- The public models page includes this bounded router report. Its existing
-- model/time index also reads ordinary calls and fetches wide facts just to
-- reject them. Keep the identical metric query on a narrow partial index.
-- Keep this a single standalone statement for Supabase CLI online builds.
create index concurrently if not exists v2_request_facts_free_router_reporting_idx
  on public.v2_request_facts (routed_model_slug, occurred_at)
  include (request_event_id)
  where requested_model_input = 'phaseo/free';
