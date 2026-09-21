do $$
declare
  affected_count integer;
begin
  update public.v2_route_capabilities as capability
  set
    params = jsonb_set(
      coalesce(capability.params, '{}'::jsonb),
      '{reasoning}',
      (
        case
          when jsonb_typeof(capability.params -> 'reasoning') = 'object'
            then capability.params -> 'reasoning'
          else '{}'::jsonb
        end
      ) || jsonb_build_object(
        'effort',
        (
          case
            when jsonb_typeof(capability.params #> '{reasoning,effort}') = 'object'
              then capability.params #> '{reasoning,effort}'
            else '{}'::jsonb
          end
        ) || jsonb_build_object(
          'supported_values', jsonb_build_array('low', 'medium', 'high', 'xhigh'),
          'default_value', 'high',
          'source_url', 'https://docs.x.ai/developers/model-capabilities/text/reasoning',
          'verified_on', '2026-09-21'
        )
      ),
      true
    ),
    updated_at = now()
  from public.v2_model_provider_routes as route
  where route.provider_model_id = capability.provider_model_id
    and route.provider_slug = 'spacex-ai'
    and route.provider_model_slug = 'grok-4.7'
    and capability.status = 'active'
    and capability.capability_id = 'text.generate';

  get diagnostics affected_count = row_count;
  if affected_count > 1 then
    raise exception 'Expected at most one active Grok 4.7 text.generate route; updated % rows', affected_count;
  end if;
end $$;
