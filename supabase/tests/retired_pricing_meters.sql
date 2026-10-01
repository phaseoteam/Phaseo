-- Run inside a transaction and roll back; exercises the public wrappers.
do $$
declare
  fixture_id uuid := gen_random_uuid();
  route_id text;
  payload jsonb;
begin
  select provider_model_id into strict route_id
  from public.v2_model_provider_routes
  where provider_slug = 'google-vertex' and provider_model_slug = 'veo-3.1-fast-generate-001';
  insert into public.v2_pricing_skus
    (sku_id, provider_model_id, sku_code, operation, display_name, service_tier_slug)
  values (fixture_id, route_id, 'retired-meter-regression', 'video.generate', 'Meter regression', 'standard');
  insert into public.v2_pricing_sku_meters
    (sku_id, meter_key, modality, direction, unit, price_nanos, display_label, display_unit, billable)
  values
    (fixture_id, 'requests', 'video', 'output', 'request', 1, 'retired-meter-regression-hidden', 'request', false),
    (fixture_id, 'output_video_seconds', 'video', 'output', 'second', 0, 'retired-meter-regression-visible', 'second', true);

  select jsonb_agg(rule) into payload
  from public.get_v2_model_pricing('google/veo-3.1-fast', null, 'standard') result,
    lateral jsonb_array_elements(result->'pricing_rules') rule
  where rule->>'id' = fixture_id::text;
  if jsonb_array_length(payload) is distinct from 1
    or payload->0->>'meter' is distinct from 'output_video_seconds'
    or (payload->0->>'price_per_unit')::numeric is distinct from 0 then
    raise exception 'Public model pricing exposed retired meter or omitted billable free meter: %', payload;
  end if;

  select jsonb_agg(result) into payload
  from public.get_v2_public_models_page_rows(null, 'standard') result
  where result->>'model_id' = 'google/veo-3.1-fast';
  if payload is null or payload::text not like '%retired-meter-regression-visible%'
    or payload::text like '%retired-meter-regression-hidden%' then
    raise exception 'Public models page exposed retired meter or omitted billable free meter';
  end if;
end;
$$;
