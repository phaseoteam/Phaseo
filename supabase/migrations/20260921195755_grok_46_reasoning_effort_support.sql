do $$
declare
  affected_count integer;
begin
  update public.v2_route_capabilities as capability
  set
    params = (
      select jsonb_agg(
        case
          when entry.item ->> 'param_id' = 'reasoning' then
            entry.item || jsonb_build_object(
              'supported_values', jsonb_build_array('low', 'medium', 'high', 'xhigh'),
              'default_value', 'high',
              'source_url', 'https://docs.x.ai/developers/model-capabilities/text/reasoning',
              'verified_on', '2026-09-21'
            )
          else entry.item
        end
        order by entry.ordinality
      )
      from jsonb_array_elements(capability.params) with ordinality as entry(item, ordinality)
    ),
    updated_at = now()
  from public.v2_model_provider_routes as route
  where route.provider_model_id = capability.provider_model_id
    and route.provider_slug = 'spacex-ai'
    and route.provider_model_slug = 'grok-4.6'
    and route.routing_enabled = true
    and capability.status = 'active'
    and capability.capability_id = 'text.generate'
    and jsonb_typeof(capability.params) = 'array'
    and exists (
      select 1
      from jsonb_array_elements(capability.params) as entry(item)
      where entry.item ->> 'param_id' = 'reasoning'
    );

  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'Expected one active Grok 4.6 text.generate route; updated % rows', affected_count;
  end if;
end $$;
