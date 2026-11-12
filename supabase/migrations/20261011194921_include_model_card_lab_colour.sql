-- Restored from Phaseo Prod migration records; already applied as version 20261011194921.
-- phaseo:allow-production-history-backfill reason: Record the model card lab colour change that was applied to production directly, so the recorded version matches without replaying it there.
-- Model cards use the lab accent; include it in both catalogue projections.
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
set work_mem = '16MB'
as $function$
  select case when p_region is null and p_service_tier is null then (
    select coalesce(
      jsonb_agg(
        payload || jsonb_build_object('organisation_colour',
          coalesce(nullif(lab.colour, ''), nullif(lab.metadata->>'colour', '')))
        order by nullif(payload->>'primary_timestamp', '')::numeric desc nulls last,
          model.created_at desc nulls last, position
      ), '[]'::jsonb
    )
    from public.get_public_models_page_rows() with ordinality as rows(payload, position)
    left join public.v2_models model on model.model_slug = payload->>'model_id'
    left join public.v2_labs lab on lab.lab_slug = payload->>'organisation_id'
    where p_organisation_id is null or payload->>'organisation_id' = p_organisation_id
  ) else (
    select coalesce(
      jsonb_agg(
        payload || jsonb_build_object('organisation_colour',
          coalesce(nullif(lab.colour, ''), nullif(lab.metadata->>'colour', '')))
        order by nullif(payload->>'primary_timestamp', '')::numeric desc nulls last,
          model.created_at desc nulls last, position
      ), '[]'::jsonb
    )
    from public.get_v2_public_models_page_rows(p_region, p_service_tier)
      with ordinality as rows(payload, position)
    left join public.v2_models model on model.model_slug = payload->>'model_id'
    left join public.v2_labs lab on lab.lab_slug = payload->>'organisation_id'
    where p_organisation_id is null or payload->>'organisation_id' = p_organisation_id
  ) end;
$function$;
