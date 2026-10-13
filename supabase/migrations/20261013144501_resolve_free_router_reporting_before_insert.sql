-- Resolve the free router's final identity before the sticky privacy trigger.
-- Preserve the deployed ingestion definition, privileges and all exclusions.
do $migration$
declare
  definition text := pg_get_functiondef('public.ingest_v2_gateway_request(jsonb)'::regprocedure);
  anchor text := '  insert into public.v2_request_facts (';
  resolution text := $resolution$
  -- The free router is a selector, not a catalogue model. Resolve its exact
  -- successful attempt before the privacy trigger sees the request. Never
  -- relax sticky exclusions or guess a route from the provider alone.
  if lower(v_requested_input) = 'phaseo/free' and v_routed_model_slug is null then
    select route.model_slug, route.provider_model_id
      into v_routed_model_slug, v_provider_model_id
    from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)
    join public.v2_model_provider_routes route
      on route.provider_slug = nullif(item.value->>'provider', '')
      and (
        route.provider_model_id = nullif(item.value->>'provider_model_id', '')
        or route.provider_model_slug = nullif(item.value->>'provider_api_model_id', '')
      )
    where coalesce((item.value->>'success')::boolean, false)
      and route.provider_slug = v_provider
    order by item.ordinality desc,
      case when route.provider_model_id = item.value->>'provider_model_id' then 0 else 1 end,
      route.provider_model_id
    limit 1;
  end if;

$resolution$;
begin
  if strpos(definition, 'The free router is a selector') > 0 then
    raise exception 'Free-router reporting resolution is already installed';
  end if;
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected exactly one request-fact insertion boundary';
  end if;
  execute replace(definition, anchor, resolution || anchor);
end;
$migration$;
