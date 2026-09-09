alter table public.v2_subscription_plan_features add column if not exists effective_to timestamptz;
drop policy if exists v2_subscription_plan_features_public_select on public.v2_subscription_plan_features;
create policy v2_subscription_plan_features_public_select on public.v2_subscription_plan_features for select to anon,authenticated using (effective_to is null or effective_to>now());

-- All reference-data edits use the same actor-aware history boundary as model edits.
create or replace function public.mutate_v2_admin_registry(
  p_actor_user_id uuid, p_resource text, p_values jsonb, p_before jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_table text; v_keys text[]; v_allowed text[]; v_identity jsonb; v_existing jsonb;
  v_columns text; v_select text; v_updates text; v_result jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  case p_resource
    when 'families' then v_table:='v2_model_families'; v_keys:=array['family_slug']; v_allowed:=array['family_slug','lab_slug','name','metadata'];
    when 'service-tiers' then v_table:='v2_service_tiers'; v_keys:=array['service_tier_slug']; v_allowed:=array['service_tier_slug','display_name','description','status','metadata'];
    when 'meters' then v_table:='v2_meter_definitions'; v_keys:=array['meter_key']; v_allowed:=array['meter_key','display_name','modality','direction','unit','default_unit_quantity','description','status','metadata'];
    when 'regions' then v_table:='v2_provider_regions'; v_keys:=array['provider_region_id']; v_allowed:=array['provider_region_id','provider_slug','region_code','display_name','execution_supported','data_residency_supported','status','routing_enabled','metadata'];
    when 'variants' then v_table:='v2_route_variants'; v_keys:=array['variant_id']; v_allowed:=array['variant_id','provider_model_id','variant_key','provider_region_id','execution_region','data_region','service_tier_slug','status','routing_enabled','endpoint_label','metadata'];
    when 'plans' then v_table:='v2_subscription_plans'; v_keys:=array['plan_uuid']; v_allowed:=array['plan_uuid','plan_id','name','lab_slug','description','frequency','price','currency','link','other_info','effective_to'];
    when 'plan-features' then v_table:='v2_subscription_plan_features'; v_keys:=array['plan_uuid','feature_name']; v_allowed:=array['plan_uuid','feature_name','feature_value','feature_description','other_info','effective_to'];
    else raise exception 'unknown registry';
  end case;
  if p_values is null or jsonb_typeof(p_values)<>'object' then raise exception 'record must be an object'; end if;
  if exists(select 1 from jsonb_object_keys(p_values) key where not key=any(v_allowed)) then raise exception 'unknown record field'; end if;
  if exists(select 1 from unnest(v_keys) key where nullif(p_values->>key,'') is null) then raise exception 'record identity required'; end if;
  select jsonb_object_agg(key,p_values->key) into v_identity from unnest(v_keys) key;
  if p_before is not null and not p_before @> v_identity then raise exception 'record identity cannot change'; end if;
  execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1 for update',v_table) into v_existing using v_identity;
  if v_existing is distinct from p_before then raise exception 'Record changed. Reload before saving.'; end if;
  if p_resource='regions' and v_existing is not null and (p_values->>'provider_slug' is distinct from v_existing->>'provider_slug' or p_values->>'region_code' is distinct from v_existing->>'region_code') then raise exception 'provider region identity cannot change'; end if;
  if p_resource='variants' then
    if v_existing is not null and (p_values->>'provider_model_id' is distinct from v_existing->>'provider_model_id' or p_values->>'variant_key' is distinct from v_existing->>'variant_key') then raise exception 'route variant identity cannot change'; end if;
    if p_values->>'provider_region_id' is not null and not exists(select 1 from public.v2_provider_regions r join public.v2_model_provider_routes m on m.provider_slug=r.provider_slug where r.provider_region_id=(p_values->>'provider_region_id')::uuid and m.provider_model_id=p_values->>'provider_model_id') then raise exception 'region belongs to another provider'; end if;
  end if;
  if p_resource in ('regions','variants') and p_values->>'status' in ('disabled','retired','deprecated') then p_values:=p_values||jsonb_build_object('routing_enabled',false); end if;
  if p_resource<>'plan-features' then p_values:=p_values||jsonb_build_object('updated_at',now()); end if;
  perform set_config('phaseo.catalogue_actor',p_actor_user_id::text,true);
  select string_agg(format('%I',key),','), string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',v_table,key),','), string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,v_table,key),',')
    into v_columns,v_select,v_updates from jsonb_object_keys(p_values) key;
  if v_existing is null then
    execute format('insert into public.%I (%s) select %s returning to_jsonb(%I.*)',v_table,v_columns,v_select,v_table) into v_result using p_values;
  else
    execute format('update public.%I t set %s where to_jsonb(t) @> $2 returning to_jsonb(t)',v_table,v_updates) into v_result using p_values,v_identity;
  end if;
  return v_result;
end $$;
revoke all on function public.mutate_v2_admin_registry(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_registry(uuid,text,jsonb,jsonb) to service_role;

-- Provider feeds propose changes; an administrator applies them through the price-version RPC.
create table public.v2_catalogue_price_proposals (
  proposal_id text primary key,
  provider_model_id text not null references public.v2_model_provider_routes(provider_model_id),
  source_url text not null,
  sku jsonb not null,
  expected_sku jsonb,
  status text not null default 'pending' check(status in ('pending','accepted','dismissed')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.v2_catalogue_price_proposals enable row level security;
revoke all on public.v2_catalogue_price_proposals from public,anon,authenticated;
grant select,insert,update on public.v2_catalogue_price_proposals to service_role;
create or replace function public.review_v2_catalogue_price_proposal(p_actor_user_id uuid,p_proposal_id text,p_accept boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_proposal public.v2_catalogue_price_proposals%rowtype; v_model text; v_current jsonb; v_result jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  select * into v_proposal from public.v2_catalogue_price_proposals where proposal_id=p_proposal_id for update;
  if not found or v_proposal.status<>'pending' then raise exception 'proposal is no longer pending'; end if;
  if p_accept then
    select model_slug into v_model from public.v2_model_provider_routes where provider_model_id=v_proposal.provider_model_id for update;
    select to_jsonb(s) into v_current from public.v2_pricing_skus s where s.provider_model_id=v_proposal.provider_model_id and s.sku_code=v_proposal.sku->>'sku_code' and effective_to is null order by version desc limit 1 for update;
    if v_current is distinct from v_proposal.expected_sku then raise exception 'Pricing changed since this proposal. Refresh the provider feed.'; end if;
    v_result:=public.mutate_v2_admin_pricing_sku(p_actor_user_id,v_model,'save',v_proposal.sku||jsonb_build_object('effective_from',now()));
  end if;
  update public.v2_catalogue_price_proposals set status=case when p_accept then 'accepted' else 'dismissed' end,reviewed_by=p_actor_user_id,reviewed_at=now() where proposal_id=p_proposal_id;
  return coalesce(v_result,'{}'::jsonb);
end $$;
revoke all on function public.review_v2_catalogue_price_proposal(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.review_v2_catalogue_price_proposal(uuid,text,boolean) to service_role;
