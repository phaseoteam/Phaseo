-- phaseo:allow-production-history-backfill reason: Restore the exact migration already recorded as applied in production.
SET lock_timeout = '3s'; SET statement_timeout = '30s';
-- Backend-only control-plane invalidation. No inference caller uses these RPCs.
create table private.routing_catalogue_revision (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 0
);
insert into private.routing_catalogue_revision values(true,0);
revoke all on private.routing_catalogue_revision from public,anon,authenticated;
grant select,update on private.routing_catalogue_revision to service_role;
create function private.invalidate_routing_catalogue() returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  update private.routing_catalogue_revision set revision=revision+1 where singleton;
  return null;
end;
$function$;
revoke all on function private.invalidate_routing_catalogue() from public,anon,authenticated;
do $migration$
declare t text;
begin
  foreach t in array array['v2_models','v2_providers','v2_model_provider_routes','v2_route_capabilities',
    'v2_route_variants','v2_pricing_skus','v2_pricing_sku_meters','v2_model_aliases','v2_provider_regions','v2_service_tiers','v2_benchmark_results','v2_benchmarks'] loop
    execute format('create trigger routing_catalogue_changed after insert or update or delete or truncate on public.%I for each statement execute function private.invalidate_routing_catalogue()',t);
  end loop;
end;
$migration$;
create function public.gateway_catalogue_revision() returns text
language sql stable security invoker set search_path = '' as $function$
  select revision::text from private.routing_catalogue_revision where singleton;
$function$;

-- One SQL statement/MVCC snapshot; never paginated independent table reads.
-- Raw source stays inside the compiler; only its strict projection reaches KV.
create function public.gateway_catalogue_source() returns jsonb
language sql stable security invoker set search_path = '' as $function$
select jsonb_build_object(
  'revision',(select revision::text from private.routing_catalogue_revision where singleton),
  'generatedAt',floor(extract(epoch from statement_timestamp())*1000),
  'source',jsonb_build_object(
    'models',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.v2_models t),
    'providers',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.v2_providers t),
    'routes',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.v2_model_provider_routes t),
    'capabilities',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.v2_route_capabilities t),
    'variants',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.v2_route_variants t),
    'regions',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.v2_provider_regions t),
    'serviceTiers',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.v2_service_tiers t),
    'skus',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.v2_pricing_skus t),
    'meters',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('price_nanos',t.price_nanos::text)),'[]') from public.v2_pricing_sku_meters t),
    'aliases',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.v2_model_aliases t),
    'benchmarks',(select coalesce(jsonb_agg(jsonb_build_object('model_slug',t.model_slug,'benchmark_id',t.benchmark_id,
      'score_numeric',t.score_numeric,'is_self_reported',t.is_self_reported,'effective_to',t.effective_to)),'[]')
      from public.v2_benchmark_results t join public.v2_benchmarks b using(benchmark_id)
      where t.is_self_reported=false and (t.effective_to is null or t.effective_to>statement_timestamp())
        and concat_ws(' ',t.benchmark_id,t.result_key,t.other_info,b.name) !~* '\minternal\M')
  )
);
$function$;
revoke all on function public.gateway_catalogue_revision() from public,anon,authenticated;
revoke all on function public.gateway_catalogue_source() from public,anon,authenticated;
grant execute on function public.gateway_catalogue_revision() to service_role;
grant execute on function public.gateway_catalogue_source() to service_role;
notify pgrst, 'reload schema';


