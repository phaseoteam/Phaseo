-- Run only after the gateway's normalizeLegacySpeedModel code is deployed.
-- This is a catalog operation, not a schema migration. Existing route IDs,
-- execution plans, capability limits, price meters and routing gates survive.
-- EmpirioLabs offers are managed separately by its tiered catalog importer.
begin;

create temporary table legacy_speed_models(model_slug text primary key, base_slug text not null) on commit drop;
insert into legacy_speed_models values
 ('minimax/minimax-m2.5-highspeed','minimax/minimax-m2.5'),
 ('moonshotai/kimi-k2.7-code-highspeed','moonshotai/kimi-k2.7-code'),
 ('xiaomi/mimo-v2.5-pro-ultraspeed','xiaomi/mimo-v2.5-pro');

do $check$ begin
 assert (select count(*)=3 from legacy_speed_models x join public.v2_models m on m.model_slug=x.model_slug), 'Missing legacy model';
 assert (select count(*)=3 from legacy_speed_models x join public.v2_models m on m.model_slug=x.base_slug and not m.hidden), 'Missing public base model';
 assert exists(select 1 from public.v2_service_tiers where service_tier_slug='priority' and status='active'), 'Priority tier is unavailable';
end $check$;

create temporary table legacy_speed_routes on commit drop as
 select r.provider_model_id,x.model_slug as legacy_slug,x.base_slug,r.provider_model_slug,
   r.status,r.routing_enabled,r.phaseo_status,r.access_scope,r.provider_availability_status
 from public.v2_model_provider_routes r join legacy_speed_models x
   on coalesce(r.metadata->>'legacy_speed_model_slug',r.model_slug)=x.model_slug
 where r.provider_slug<>'empiriolabs';

update public.v2_model_provider_routes r set model_slug=x.base_slug,
 metadata=r.metadata || jsonb_build_object('legacy_speed_model_slug',x.legacy_slug,'catalog_service_tier','fast'),updated_at=now()
 from legacy_speed_routes x where r.provider_model_id=x.provider_model_id;

update public.v2_route_capabilities c set params=c.params || jsonb_build_object('service_tier',
 case when jsonb_typeof(c.params->'service_tier')='object' then c.params->'service_tier' else '{}'::jsonb end
 || jsonb_build_object('type','string','enum',jsonb_build_array('fast','priority'),
   'provider_catalog',jsonb_build_object('name','fast','upstream',null))),updated_at=now()
 where c.provider_model_id in(select provider_model_id from legacy_speed_routes) and c.capability_id='text.generate';

update public.v2_pricing_skus set service_tier_slug='priority',updated_at=now()
 where provider_model_id in(select provider_model_id from legacy_speed_routes) and status='active' and operation='text.generate';
update public.v2_route_variants set service_tier_slug='priority',updated_at=now()
 where provider_model_id in(select provider_model_id from legacy_speed_routes);

-- The gateway reads this marker before ordinary model resolution. Leaving a
-- hidden historical identity also prevents catalog imports from approving it
-- as a new standard-priced offer through a plain alias.
update public.v2_models m set hidden=true,status='retired',catalogue_status='retired',replacement_model_slug=x.base_slug,
 metadata=m.metadata || jsonb_build_object('serving_tier',jsonb_build_object('model_slug',x.base_slug,'name','fast')),updated_at=now()
 from legacy_speed_models x where m.model_slug=x.model_slug;

do $check$ begin
 assert not exists(select 1 from legacy_speed_routes x join public.v2_model_provider_routes r using(provider_model_id)
   where r.model_slug<>x.base_slug or r.provider_model_slug is distinct from x.provider_model_slug
     or (r.status,r.routing_enabled,r.phaseo_status,r.access_scope,r.provider_availability_status)
       is distinct from (x.status,x.routing_enabled,x.phaseo_status,x.access_scope,x.provider_availability_status)), 'Route gates or identity changed';
 assert not exists(select 1 from public.v2_pricing_skus s join legacy_speed_routes x using(provider_model_id)
   where s.status='active' and s.operation='text.generate' and s.service_tier_slug is distinct from 'priority'), 'Incorrect speed pricing tier';
end $check$;
commit;
