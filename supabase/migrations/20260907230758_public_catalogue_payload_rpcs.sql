-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

set local lock_timeout='5s';
-- Return each computed catalogue as one scalar JSON value. PostgREST's row
-- limit otherwise forces the API to rerun these full-catalogue functions for
-- every 1,000-row page. Existing row RPCs remain available to other callers.
create or replace function public.get_public_models_page_payload(
  p_region text default null,
  p_service_tier text default null,
  p_organisation_id text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
  select case when p_region is null and p_service_tier is null then (
    select coalesce(jsonb_agg(payload order by position), '[]'::jsonb)
    from public.get_public_models_page_rows() with ordinality as rows(payload, position)
    where p_organisation_id is null or payload->>'organisation_id' = p_organisation_id
  ) else (
    select coalesce(jsonb_agg(payload order by position), '[]'::jsonb)
    from public.get_v2_public_models_page_rows(p_region, p_service_tier)
      with ordinality as rows(payload, position)
    where p_organisation_id is null or payload->>'organisation_id' = p_organisation_id
  ) end;
$function$;

create or replace function public.get_public_monitor_rows_payload()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
  from public.get_monitor_model_rows(false) as row;
$function$;

-- Only the web API may consume these bulk payloads. It retains its existing
-- public projection and stealth-provider redaction before returning data.
revoke all on function public.get_public_models_page_payload(text, text, text) from public, anon, authenticated;
revoke all on function public.get_public_monitor_rows_payload() from public, anon, authenticated;
grant execute on function public.get_public_models_page_payload(text, text, text) to service_role;
grant execute on function public.get_public_monitor_rows_payload() to service_role;

notify pgrst, 'reload schema';

