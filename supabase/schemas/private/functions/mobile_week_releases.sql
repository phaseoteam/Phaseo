CREATE OR REPLACE FUNCTION private.mobile_week_releases (
  p_user_id uuid,
  p_from    timestamp with time zone,
  p_to      timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- Models released, or newly available on Phaseo, from p_from up to but not including p_to that
-- one of the user's enabled notify rules matches and none of their enabled mute rules does, as
-- fan-out would judge them today: each model once, newest first. Models no longer public are
-- left out.
with events as (
  select
    e.kind,
    e.model_slug,
    e.lab_slug,
    e.provider_slug,
    e.occurred_at,
    e.href,
    coalesce(nullif(btrim(e.payload ->> 'modelName'), ''), m.name, e.model_slug) as model_name,
    coalesce(nullif(btrim(e.payload ->> 'labName'), ''), lab.name, e.lab_slug) as lab_name,
    m.input_modalities,
    m.output_modalities,
    e.kind = 'gateway_available' or exists (
      select 1 from public.v2_model_provider_routes r
      where r.model_slug = e.model_slug and r.routing_enabled and r.access_scope = 'public'
        and not r.is_stealth and r.status in ('active', 'degraded')
    ) as on_phaseo
  from public.catalogue_notification_events e
  left join public.v2_models m on m.model_slug = e.model_slug
  left join public.v2_labs lab on lab.lab_slug = e.lab_slug
  where e.kind in ('model_released', 'gateway_available')
    and e.occurred_at >= p_from and e.occurred_at < p_to
    and e.model_slug is not null
    and public.catalog_model_is_public(e.model_slug)
),
matched as (
  select distinct on (ev.model_slug) ev.*
  from events ev
  where exists (
      select 1 from public.mobile_notification_rules r
      where r.user_id = p_user_id and r.action = 'notify'
        and private.mobile_notification_rule_matches(r, ev.kind, ev.lab_slug, ev.provider_slug, ev.model_slug,
          ev.input_modalities, ev.output_modalities, ev.on_phaseo)
    )
    and not exists (
      select 1 from public.mobile_notification_rules r
      where r.user_id = p_user_id and r.action = 'mute'
        and private.mobile_notification_rule_matches(r, ev.kind, ev.lab_slug, ev.provider_slug, ev.model_slug,
          ev.input_modalities, ev.output_modalities, ev.on_phaseo)
    )
  order by ev.model_slug, ev.occurred_at, ev.kind desc
)
select coalesce(jsonb_agg(jsonb_build_object(
  'modelId', matched.model_slug,
  'name', matched.model_name,
  'labId', matched.lab_slug,
  'labName', matched.lab_name,
  'kind', matched.kind,
  'occurredAt', to_char(matched.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'href', matched.href
) order by matched.occurred_at desc, matched.model_slug), '[]'::jsonb)
from matched;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_week_releases"(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_week_releases"(uuid, timestamp with time zone, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_week_releases"(uuid, timestamp with time zone, timestamp with time zone) TO "postgres";
