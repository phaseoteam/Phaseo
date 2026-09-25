-- Free XS responses can report cached input. Add only the missing meter;
-- never overwrite existing prices or modify historical/non-free SKUs.
insert into public.v2_pricing_sku_meters (
  sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos,
  display_label, display_unit, billable, meter_order, metadata
)
select
  sku.sku_id, 'cached_read_text_tokens', 'text', 'input', 'token', 1000000, 0,
  'cached_read_text_tokens', '1M tokens', true, 100,
  jsonb_build_object(
    'note', 'Free preview',
    'source', 'migration',
    'source_key', '20260925192859_add_laguna_xs_free_cache_meter',
    'priority', 100,
    'time_windows', '[]'::jsonb,
    'billing_timestamp_basis', 'request_start'
  )
from public.v2_pricing_skus sku
where sku.provider_model_id = 'poolside:poolside/laguna-xs-2.1:free'
  and sku.operation = 'text.generate'
  and sku.service_tier_slug = 'free'
  and sku.status = 'active'
  and sku.effective_from <= now()
  and sku.effective_to is null
  and 2 = (
    select count(*)
    from public.v2_pricing_sku_meters meter
    where meter.sku_id = sku.sku_id
      and meter.meter_key in ('input_text_tokens', 'output_text_tokens')
      and meter.price_nanos = 0
      and meter.unit = 'token'
      and meter.unit_quantity = 1000000
      and meter.billable = true
  )
on conflict (sku_id, meter_key) do nothing;
