-- Keep exactly one v2 SKU per legacy pricing rule. Prefer the exact
-- provider:api_model_id route encoded by model_key; fall back to the active
-- provider-model row when the legacy provider slug is an alias.

with preferred as (
  select
    r.rule_id::text as rule_id,
    coalesce(exact_route.provider_model_id, fallback_route.provider_model_id) as provider_model_id
  from public.data_api_pricing_rules r
  left join public.v2_model_provider_routes exact_route
    on exact_route.provider_model_id = split_part(r.model_key, ':', 1)
      || ':'
      || split_part(substring(r.model_key from position(':' in r.model_key) + 1), ':', 1)
  left join lateral (
    select p.provider_api_model_id
    from public.data_api_provider_models p
    where p.provider_id = split_part(r.model_key, ':', 1)
      and p.api_model_id = split_part(substring(r.model_key from position(':' in r.model_key) + 1), ':', 1)
    order by p.is_active_gateway desc, p.effective_from desc nulls last, p.provider_api_model_id
    limit 1
  ) candidate on true
  left join public.v2_model_provider_routes fallback_route
    on fallback_route.provider_model_id = candidate.provider_api_model_id
)
delete from public.v2_pricing_skus sku
using preferred
where sku.metadata->>'legacy_rule_id' = preferred.rule_id
  and preferred.provider_model_id is not null
  and sku.provider_model_id <> preferred.provider_model_id;
