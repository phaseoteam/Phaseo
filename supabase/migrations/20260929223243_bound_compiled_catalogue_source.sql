-- phaseo:allow-production-history-backfill reason: Restore the exact migration already recorded as applied in production.
SET lock_timeout='3s'; SET statement_timeout='30s';
-- Keep compiler input bounded before aggregation. Historical audit/provenance,
-- descriptions and arbitrary metadata are not catalogue compiler inputs.
create or replace function private.project_routing_catalogue_row(input jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) || jsonb_build_object('metadata',
  (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
   from jsonb_each(case when jsonb_typeof(input->'metadata')='object' then input->'metadata' else '{}'::jsonb end)
   where key in ('availability','self_serve','quantization_scheme','match','priority',
     'included_quantity','billing_timestamp_basis','time_windows')))
from jsonb_each(input) where key in (
 'model_slug','provider_slug','provider_model_id','variant_id','sku_id','sku_meter_id',
 'provider_region_id','service_tier_slug','capability_id','alias_slug','enabled',
 'status','hidden','access_scope','is_stealth','availability','provider_availability_status',
 'phaseo_status','available_from','effective_from','effective_to','released_at','retired_at',
 'routable','routing_enabled','route_variant_id','region','execution_region','data_region',
 'region_code','execution_supported','data_residency_supported','currency','operation',
 'billable','meter_key','unit','unit_quantity','price_nanos','meter_order','params',
 'regions','default_execution_regions','default_data_regions','provider_family_slug',
 'provider_model_slug','context_length','max_input_tokens','max_output_tokens',
 'input_modalities','output_modalities','zero_data_retention','credential_mode',
 'residency_mode','prompt_training_policy','data_policy_tier','data_policy_confidence',
 'data_policy_contract_mode','data_policy_variant','stream_cancellation_support',
 'stream_cancellation_stops_provider_billing','stream_cancellation_usage_recovery',
 'stream_cancellation_evidence_kind','benchmark_id','score_numeric','is_self_reported'
);
$$;
revoke all on function private.project_routing_catalogue_row(jsonb) from public,anon,authenticated;
grant execute on function private.project_routing_catalogue_row(jsonb) to service_role;

create or replace function public.gateway_catalogue_source() returns jsonb
language sql stable security invoker set search_path = '' as $$
with projected as materialized (
 select 'models' as kind,private.project_routing_catalogue_row(to_jsonb(t)) as row from public.v2_models t
 union all select 'providers',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_providers t
 union all select 'routes',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_model_provider_routes t
 union all select 'capabilities',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_route_capabilities t
 union all select 'variants',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_route_variants t
 union all select 'regions',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_provider_regions t
 union all select 'serviceTiers',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_service_tiers t
 union all select 'skus',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_pricing_skus t
 union all select 'meters',private.project_routing_catalogue_row(to_jsonb(t)||jsonb_build_object('price_nanos',t.price_nanos::text)) from public.v2_pricing_sku_meters t
 union all select 'aliases',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_model_aliases t
 union all select 'benchmarks',jsonb_build_object('model_slug',t.model_slug,'benchmark_id',t.benchmark_id,
   'score_numeric',t.score_numeric,'is_self_reported',t.is_self_reported,'effective_to',t.effective_to)
   from public.v2_benchmark_results t join public.v2_benchmarks b using(benchmark_id)
   where t.is_self_reported=false and (t.effective_to is null or t.effective_to>statement_timestamp())
     and concat_ws(' ',t.benchmark_id,t.result_key,t.other_info,b.name) !~* '\minternal\M'
), budget as (
 select count(*) as rows,coalesce(sum(octet_length(row::text)),0) as bytes,
   coalesce(max(octet_length(row::text)),0) as largest from projected
)
select case when rows > 100000 or bytes > 16777216 or largest > 262144
 then jsonb_build_object('error','catalogue_source_too_large')
 else jsonb_build_object(
  'revision',(select revision::text from private.routing_catalogue_revision where singleton),
  'generatedAt',floor(extract(epoch from statement_timestamp())*1000),
  'source',(select jsonb_object_agg(k.kind,coalesce(p.items,'[]'::jsonb))
    from unnest(array['models','providers','routes','capabilities','variants','regions','serviceTiers','skus','meters','aliases','benchmarks']) k(kind)
    left join (select kind,jsonb_agg(row) as items from projected group by kind) p using(kind))
 ) end from budget;
$$;
revoke all on function public.gateway_catalogue_source() from public,anon,authenticated;
grant execute on function public.gateway_catalogue_source() to service_role;
notify pgrst, 'reload schema';


