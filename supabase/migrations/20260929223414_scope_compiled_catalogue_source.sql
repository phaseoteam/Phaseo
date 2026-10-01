-- phaseo:allow-production-history-backfill reason: Restore the exact migration already recorded as applied in production.
SET lock_timeout='3s'; SET statement_timeout='30s';
create or replace function public.gateway_catalogue_source() returns jsonb
language sql stable security invoker set search_path = '' as $$
with selected_routes as materialized (
 select * from public.v2_model_provider_routes
 where is_stealth is true or (access_scope='public' and routing_enabled is true
   and status in ('active','degraded') and (effective_to is null or effective_to>statement_timestamp()))
), selected_skus as materialized (
 select s.* from public.v2_pricing_skus s join selected_routes r using(provider_model_id)
 where s.status in ('active','degraded') and (s.effective_to is null or s.effective_to>statement_timestamp())
), projected as materialized (
 select 'models' as kind,private.project_routing_catalogue_row(to_jsonb(t)) as row from public.v2_models t
 union all select 'providers',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_providers t
 union all select 'routes',private.project_routing_catalogue_row(to_jsonb(t)) from selected_routes t
 union all select 'capabilities',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_route_capabilities t where exists(select 1 from selected_routes r where r.provider_model_id=t.provider_model_id)
 union all select 'variants',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_route_variants t where exists(select 1 from selected_routes r where r.provider_model_id=t.provider_model_id)
 union all select 'regions',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_provider_regions t
 union all select 'serviceTiers',private.project_routing_catalogue_row(to_jsonb(t)) from public.v2_service_tiers t
 union all select 'skus',private.project_routing_catalogue_row(to_jsonb(t)) from selected_skus t
 union all select 'meters',private.project_routing_catalogue_row(to_jsonb(t)||jsonb_build_object('price_nanos',t.price_nanos::text)) from public.v2_pricing_sku_meters t where exists(select 1 from selected_skus s where s.sku_id=t.sku_id)
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


