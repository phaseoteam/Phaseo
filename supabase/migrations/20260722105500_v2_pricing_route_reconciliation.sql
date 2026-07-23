-- Reconcile pricing rows whose legacy model_key uses the provider-local
-- api_model_id (for example alibaba-cloud:qwen/qvq-max:text.generate).

insert into public.v2_pricing_skus (
  provider_model_id, sku_code, version, operation, status, display_name,
  description, currency, effective_from, effective_to, metadata
)
select
  route.provider_model_id,
  'legacy-' || replace(r.rule_id::text, '-', ''),
  1,
  r.capability_id,
  case when r.effective_to is not null and r.effective_to <= now() then 'deprecated' else 'active' end,
  coalesce(nullif(r.tier_label, ''), r.meter),
  r.note,
  coalesce(r.currency, 'USD'),
  coalesce(r.effective_from, '1970-01-01T00:00:00Z'::timestamptz),
  case
    when r.effective_to is not null
      and r.effective_to <= coalesce(r.effective_from, '1970-01-01T00:00:00Z'::timestamptz)
      then null
    else r.effective_to
  end,
  jsonb_build_object('legacy_rule_id', r.rule_id, 'legacy_model_key', r.model_key, 'reconciled', true)
from public.data_api_pricing_rules r
join lateral (
  select p.provider_api_model_id
  from public.data_api_provider_models p
  where p.provider_id = split_part(r.model_key, ':', 1)
    and p.api_model_id = split_part(substring(r.model_key from position(':' in r.model_key) + 1), ':', 1)
  order by p.is_active_gateway desc, p.effective_from desc nulls last, p.provider_api_model_id
  limit 1
) legacy_route on true
join public.v2_model_provider_routes route on route.provider_model_id = legacy_route.provider_api_model_id
on conflict (provider_model_id, sku_code, version) do update set
  operation = excluded.operation,
  status = excluded.status,
  display_name = excluded.display_name,
  description = excluded.description,
  currency = excluded.currency,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  updated_at = now(),
  metadata = public.v2_pricing_skus.metadata || excluded.metadata;

insert into public.v2_pricing_sku_meters (
  sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos,
  display_label, display_unit, metadata
)
select
  sku.sku_id,
  lower(regexp_replace(r.meter, '[^a-zA-Z0-9._:-]+', '_', 'g')),
  case
    when r.meter ilike '%audio%' then 'audio'
    when r.meter ilike '%image%' or r.meter ilike '%pixel%' then 'image'
    when r.meter ilike '%video%' or r.meter ilike '%second%' then 'video'
    when r.meter ilike '%character%' then 'text'
    when r.meter ilike '%embedding%' then 'embedding'
    when r.meter ilike '%rerank%' then 'rerank'
    else 'text'
  end,
  case when r.meter ilike 'input_%' or r.meter ilike 'cached_%' then 'input'
       when r.meter ilike 'output_%' then 'output' else null end,
  coalesce(r.unit, 'unit'),
  coalesce(r.unit_size, 1),
  round(coalesce(r.price_per_unit, 0) * 1000000000, 12),
  coalesce(r.meter, 'meter'),
  coalesce(r.unit_size, 1)::text || ' ' || coalesce(r.unit, 'unit'),
  jsonb_build_object('legacy_rule_id', r.rule_id, 'reconciled', true)
from public.data_api_pricing_rules r
join lateral (
  select p.provider_api_model_id
  from public.data_api_provider_models p
  where p.provider_id = split_part(r.model_key, ':', 1)
    and p.api_model_id = split_part(substring(r.model_key from position(':' in r.model_key) + 1), ':', 1)
  order by p.is_active_gateway desc, p.effective_from desc nulls last, p.provider_api_model_id
  limit 1
) legacy_route on true
join public.v2_model_provider_routes route on route.provider_model_id = legacy_route.provider_api_model_id
join public.v2_pricing_skus sku
  on sku.provider_model_id = route.provider_model_id
 and sku.sku_code = 'legacy-' || replace(r.rule_id::text, '-', '')
 and sku.version = 1
on conflict (sku_id, meter_key) do update set
  modality = excluded.modality,
  direction = excluded.direction,
  unit = excluded.unit,
  unit_quantity = excluded.unit_quantity,
  price_nanos = excluded.price_nanos,
  display_label = excluded.display_label,
  display_unit = excluded.display_unit,
  metadata = public.v2_pricing_sku_meters.metadata || excluded.metadata;

delete from public.v2_catalogue_backfill_issues issue
where issue.source_type = 'pricing_rule'
  and issue.issue_code = 'unresolved_provider_model'
  and exists (
    select 1
    from public.data_api_pricing_rules r
    join lateral (
      select p.provider_api_model_id
      from public.data_api_provider_models p
      where p.provider_id = split_part(r.model_key, ':', 1)
        and p.api_model_id = split_part(substring(r.model_key from position(':' in r.model_key) + 1), ':', 1)
      order by p.is_active_gateway desc, p.effective_from desc nulls last, p.provider_api_model_id
      limit 1
    ) legacy_route on true
    join public.v2_model_provider_routes route on route.provider_model_id = legacy_route.provider_api_model_id
    where r.rule_id::text = issue.source_key
  );
