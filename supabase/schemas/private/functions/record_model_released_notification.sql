CREATE OR REPLACE FUNCTION private.record_model_released_notification()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The public announcer marks a model announced once it is public and available or in
-- preview, after its public post went out. That transition is the release signal; a
-- model is only ever released once, however often it is announced again.
begin
  insert into public.catalogue_notification_events (kind, dedupe_key, model_slug, lab_slug, title, body, href, payload, occurred_at)
  select
    'model_released',
    'model_released:' || m.model_slug,
    m.model_slug,
    m.lab_slug,
    left(coalesce(nullif(btrim(l.name), ''), m.lab_slug) || ' released ' || coalesce(nullif(btrim(m.name), ''), m.model_slug), 300),
    case
      when exists (
        select 1 from public.v2_model_provider_routes r
        where r.model_slug = m.model_slug and r.routing_enabled and r.access_scope = 'public'
          and not r.is_stealth and r.status in ('active', 'degraded')
      ) then 'You can use it on Phaseo now.'
      else 'See the details on Phaseo.'
    end,
    '/models/' || m.model_slug,
    jsonb_build_object('modelName', m.name, 'labName', l.name, 'catalogueStatus', m.catalogue_status),
    coalesce(new.announced_at, now())
  from public.v2_models m
  left join public.v2_labs l on l.lab_slug = m.lab_slug
  where m.model_slug = new.model_slug
    and public.catalog_model_is_public(m.model_slug)
  on conflict (dedupe_key) do nothing;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."record_model_released_notification"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."record_model_released_notification"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."record_model_released_notification"() TO "postgres";
