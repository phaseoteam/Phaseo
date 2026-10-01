set local lock_timeout = '5s';

-- Keep lifecycle dates as the primary catalogue order. When models share the
-- same lifecycle date, show the model catalogued most recently first.
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
    select coalesce(
      jsonb_agg(
        payload order by
          nullif(payload->>'primary_timestamp', '')::numeric desc nulls last,
          model.created_at desc nulls last,
          position
      ),
      '[]'::jsonb
    )
    from public.get_public_models_page_rows() with ordinality as rows(payload, position)
    left join public.v2_models model on model.model_slug = payload->>'model_id'
    where p_organisation_id is null or payload->>'organisation_id' = p_organisation_id
  ) else (
    select coalesce(
      jsonb_agg(
        payload order by
          nullif(payload->>'primary_timestamp', '')::numeric desc nulls last,
          model.created_at desc nulls last,
          position
      ),
      '[]'::jsonb
    )
    from public.get_v2_public_models_page_rows(p_region, p_service_tier)
      with ordinality as rows(payload, position)
    left join public.v2_models model on model.model_slug = payload->>'model_id'
    where p_organisation_id is null or payload->>'organisation_id' = p_organisation_id
  ) end;
$function$;

revoke all on function public.get_public_models_page_payload(text, text, text) from public, anon, authenticated;
grant execute on function public.get_public_models_page_payload(text, text, text) to service_role;

notify pgrst, 'reload schema';
