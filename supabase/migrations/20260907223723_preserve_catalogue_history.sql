-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.
-- phaseo:allow-destructive-migration reason: Restore already-applied history: deletes occur inside existing admin replacement functions; production will not replay this migration.

-- Retain catalogue rows and record every change, including importer writes.
-- phaseo:allow-destructive-migration reason: Existing model detail/link collections still use transactional replacement; their complete old rows are retained by the append-only history triggers.
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table public.v2_catalogue_admin_changes drop constraint if exists v2_catalogue_admin_changes_resource_type_check;
alter table public.v2_catalogue_admin_changes add constraint v2_catalogue_admin_changes_resource_type_check check(resource_type in ('pricing_sku','organisations','providers','benchmarks','subscription-plans','models','model_graph','provider_route','model_notice','model_aliases'));

alter table public.v2_benchmark_results add column effective_to timestamptz;
alter table public.v2_subscription_plan_models add column effective_to timestamptz;
alter policy v2_benchmark_results_public_select on public.v2_benchmark_results using (effective_to is null or effective_to>now());
alter policy v2_subscription_plan_models_public_select on public.v2_subscription_plan_models using (effective_to is null or effective_to>now());

create table public.v2_catalogue_row_history (
  event_id bigint generated always as identity primary key,
  table_name text not null,
  model_slug text,
  operation text not null check(operation in ('INSERT','UPDATE','DELETE','BASELINE')),
  actor_user_id uuid,
  transaction_id bigint not null default txid_current(),
  before_state jsonb,
  after_state jsonb,
  recorded_at timestamptz not null default clock_timestamp()
);
alter table public.v2_catalogue_row_history enable row level security;
revoke all on public.v2_catalogue_row_history from public,anon,authenticated,service_role;
grant select on public.v2_catalogue_row_history to service_role;
create index v2_catalogue_row_history_table_time_idx on public.v2_catalogue_row_history(table_name,recorded_at desc);
create index v2_catalogue_row_history_model_idx on public.v2_catalogue_row_history(model_slug,event_id desc);

create function public.reject_catalogue_history_change() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'catalogue history is append-only'; end $$;
create trigger catalogue_history_immutable before update or delete or truncate on public.v2_catalogue_row_history
for each statement execute function public.reject_catalogue_history_change();

create schema if not exists catalogue_private;
revoke all on schema catalogue_private from public,anon,authenticated;
create function catalogue_private.history_model(p_row jsonb) returns text
language sql stable set search_path=public,pg_temp as $$
  select coalesce(p_row->>'model_slug',
    (select model_slug from public.v2_model_provider_routes where provider_model_id=p_row->>'provider_model_id'),
    (select r.model_slug from public.v2_pricing_skus s join public.v2_model_provider_routes r using(provider_model_id) where s.sku_id=(p_row->>'sku_id')::uuid));
$$;
revoke all on function catalogue_private.history_model(jsonb) from public,anon,authenticated;
create function catalogue_private.record_row_history() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if TG_OP='UPDATE' and to_jsonb(OLD)=to_jsonb(NEW) then return NEW; end if;
  insert into public.v2_catalogue_row_history(table_name,model_slug,operation,actor_user_id,before_state,after_state)
  values(TG_TABLE_NAME,catalogue_private.history_model(coalesce(to_jsonb(NEW),to_jsonb(OLD))),TG_OP,nullif(current_setting('phaseo.catalogue_actor',true),'')::uuid,
    case when TG_OP<>'INSERT' then to_jsonb(OLD) end,case when TG_OP<>'DELETE' then to_jsonb(NEW) end);
  return coalesce(NEW,OLD);
end $$;
revoke all on function catalogue_private.record_row_history() from public,anon,authenticated,service_role;

create function public.prevent_catalogue_removal() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'saved catalogue records cannot be deleted; set an end date instead'; end $$;
revoke all on function public.prevent_catalogue_removal() from public,anon,authenticated;
revoke all on function public.reject_catalogue_history_change() from public,anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['v2_models','v2_labs','v2_lab_links','v2_providers','v2_benchmarks',
    'v2_subscription_plans','v2_subscription_plan_models','v2_model_provider_routes','v2_route_capabilities',
    'v2_pricing_skus','v2_pricing_sku_meters','v2_model_aliases','v2_model_details','v2_model_links',
    'v2_benchmark_results','v2_model_families','v2_model_page_notices','v2_provider_regions','v2_service_tiers',
    'v2_route_variants','v2_meter_definitions','v2_subscription_plan_features','v2_catalogue_source_overrides'] loop
    execute format('lock table public.%I in share row exclusive mode',t);
    execute format('insert into public.v2_catalogue_row_history(table_name,model_slug,operation,after_state) select %L,catalogue_private.history_model(to_jsonb(t)),''BASELINE'',to_jsonb(t) from public.%I t',t,t);
    execute format('create trigger catalogue_row_history after insert or update or delete on public.%I for each row execute function catalogue_private.record_row_history()',t);
  end loop;
  foreach t in array array['v2_models','v2_labs','v2_providers','v2_benchmarks','v2_subscription_plans',
    'v2_model_provider_routes','v2_route_capabilities','v2_pricing_skus','v2_pricing_sku_meters','v2_model_aliases','v2_subscription_plan_models','v2_benchmark_results'] loop
    execute format('create trigger catalogue_no_removal before delete or truncate on public.%I for each statement execute function public.prevent_catalogue_removal()',t);
  end loop;
end $$;

create or replace function public.mutate_v2_admin_pricing_sku(
  p_actor_user_id uuid,
  p_model_slug text,
  p_action text,
  p_sku jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sku_id uuid;
  v_provider_model_id text;
  v_existing public.v2_pricing_skus%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_meter jsonb;
  v_resource_id text;
  v_starts timestamptz;
  v_version integer;
begin
  if p_actor_user_id is null then
    raise exception 'actor_user_id is required';
  end if;
  if coalesce(trim(p_model_slug), '') = '' then
    raise exception 'model_slug is required';
  end if;
  if p_action not in ('save', 'end_date') then
    raise exception 'unsupported pricing mutation action';
  end if;
  if not exists (
    select 1 from public.users
    where user_id = p_actor_user_id
      and lower(coalesce(role::text, '')) = 'admin'
  ) then
    raise exception 'actor must have the admin role';
  end if;

  if nullif(p_sku->>'sku_id', '') is not null then
    begin
      v_sku_id := (p_sku->>'sku_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'sku_id must be a UUID';
    end;
  end if;

  if v_sku_id is not null then
    select * into v_existing
    from public.v2_pricing_skus
    where sku_id = v_sku_id for update;

    if found then
      select jsonb_build_object(
        'sku', to_jsonb(v_existing),
        'meters', coalesce((
          select jsonb_agg(to_jsonb(meter) order by meter.meter_order, meter.meter_key)
          from public.v2_pricing_sku_meters meter
          where meter.sku_id = v_sku_id
        ), '[]'::jsonb)
      ) into v_before;

      if not exists (
        select 1
        from public.v2_model_provider_routes route
        where route.provider_model_id = v_existing.provider_model_id
          and route.model_slug = p_model_slug
      ) then
        raise exception 'pricing SKU does not belong to the requested model';
      end if;
    end if;
  end if;

  if v_sku_id is not null and v_before is null then
    raise exception 'pricing SKU not found';
  end if;
  perform set_config('phaseo.catalogue_actor', p_actor_user_id::text, true);
  if p_action = 'end_date' then
    if v_before is null then raise exception 'pricing SKU not found'; end if;
    v_starts := nullif(p_sku->>'effective_to','')::timestamptz;
    if v_starts is null or v_starts <= v_existing.effective_from then
      raise exception 'end date must be after the start date';
    end if;
    if v_existing.effective_to is not null and v_existing.effective_to <= now() then
      raise exception 'historical prices cannot be changed';
    end if;
    if exists(select 1 from public.v2_pricing_skus where provider_model_id=v_existing.provider_model_id and sku_code=v_existing.sku_code and version>v_existing.version) then
      raise exception 'a superseded version cannot be changed';
    end if;
    update public.v2_pricing_skus set effective_to=v_starts,updated_at=now() where sku_id=v_sku_id;
    select jsonb_build_object('sku',to_jsonb(t),'meters',v_before->'meters') into v_after
      from public.v2_pricing_skus t where sku_id=v_sku_id;
    insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
      values(p_actor_user_id,'pricing_sku',v_sku_id::text,'update',v_before,v_after);
    if nullif(v_existing.metadata->>'source_key','') is not null then
      insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
        values('pricing_rule',v_existing.metadata->>'source_key','database_managed',p_actor_user_id,v_sku_id::text,now())
        on conflict(source_type,source_key) do update set disposition=excluded.disposition,actor_user_id=excluded.actor_user_id,resource_id=excluded.resource_id,updated_at=now();
    end if;
    return v_after;
  end if;

  v_provider_model_id := nullif(trim(p_sku->>'provider_model_id'), '');
  if v_provider_model_id is null then
    raise exception 'provider_model_id is required';
  end if;
  if not exists (
    select 1
    from public.v2_model_provider_routes route
    where route.provider_model_id = v_provider_model_id
      and route.model_slug = p_model_slug
  ) then
    raise exception 'provider route does not belong to the requested model';
  end if;
  if jsonb_typeof(coalesce(p_sku->'meters', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_sku->'meters', '[]'::jsonb)) = 0 then
    raise exception 'at least one pricing meter is required';
  end if;

  -- Serialize versions of a price family, including concurrent new prices.
  perform pg_advisory_xact_lock(hashtextextended(v_provider_model_id||':'||lower(trim(p_sku->>'sku_code')),0));
  v_starts := coalesce(nullif(p_sku->>'effective_from','')::timestamptz,now());
  if v_before is not null then
    if v_existing.provider_model_id <> v_provider_model_id or v_existing.sku_code <> lower(trim(p_sku->>'sku_code')) then
      raise exception 'a price revision must keep its provider route and price code';
    end if;
    if v_existing.effective_to is not null then raise exception 'end-dated prices cannot be revised; add a new price group'; end if;
    if v_starts <= v_existing.effective_from then raise exception 'revision must start after the previous version'; end if;
    update public.v2_pricing_skus set effective_to=v_starts,updated_at=now() where sku_id=v_sku_id;
  elsif exists(select 1 from public.v2_pricing_skus where provider_model_id=v_provider_model_id and sku_code=lower(trim(p_sku->>'sku_code'))) then
    raise exception 'price group already exists; reload and create a revision';
  end if;
  select coalesce(max(version),0)+1 into v_version from public.v2_pricing_skus
    where provider_model_id=v_provider_model_id and sku_code=lower(trim(p_sku->>'sku_code'));
  v_sku_id := gen_random_uuid();
  insert into public.v2_pricing_skus (
    sku_id,
    provider_model_id,
    sku_code,
    version,
    operation,
    status,
    region,
    service_tier_slug,
    display_name,
    description,
    currency,
    effective_from,
    effective_to,
    metadata,
    updated_at
  ) values (
    v_sku_id,
    v_provider_model_id,
    lower(trim(p_sku->>'sku_code')),
    v_version,
    coalesce(nullif(trim(p_sku->>'operation'), ''), 'inference'),
    coalesce(nullif(trim(p_sku->>'status'), ''), 'active'),
    nullif(trim(p_sku->>'region'), ''),
    coalesce(nullif(trim(p_sku->>'service_tier_slug'), ''), 'standard'),
    trim(p_sku->>'display_name'),
    nullif(trim(p_sku->>'description'), ''),
    upper(coalesce(nullif(trim(p_sku->>'currency'), ''), 'USD')),
    v_starts,
    nullif(p_sku->>'effective_to', '')::timestamptz,
    coalesce(p_sku->'metadata', '{}'::jsonb) || jsonb_build_object(
      'source', 'admin',
      'authored_by', p_actor_user_id,
      'authored_at', now()
    ),
    now()
  )
  ;

  for v_meter in select value from jsonb_array_elements(p_sku->'meters')
  loop
    insert into public.v2_pricing_sku_meters (
      sku_id,
      meter_key,
      modality,
      direction,
      unit,
      unit_quantity,
      price_nanos,
      display_label,
      display_unit,
      billable,
      meter_order,
      metadata
    ) values (
      v_sku_id,
      lower(trim(v_meter->>'meter_key')),
      lower(trim(v_meter->>'modality')),
      nullif(lower(trim(v_meter->>'direction')), ''),
      lower(trim(v_meter->>'unit')),
      (v_meter->>'unit_quantity')::numeric,
      (v_meter->>'price_nanos')::numeric,
      trim(v_meter->>'display_label'),
      trim(v_meter->>'display_unit'),
      coalesce((v_meter->>'billable')::boolean, true),
      coalesce((v_meter->>'meter_order')::integer, 100),
      coalesce(v_meter->'metadata', '{}'::jsonb) || jsonb_build_object('source', 'admin')
    );
  end loop;

  select jsonb_build_object(
    'sku', to_jsonb(sku),
    'meters', coalesce((
      select jsonb_agg(to_jsonb(meter) order by meter.meter_order, meter.meter_key)
      from public.v2_pricing_sku_meters meter
      where meter.sku_id = v_sku_id
    ), '[]'::jsonb)
  ) into v_after
  from public.v2_pricing_skus sku
  where sku.sku_id = v_sku_id;

  v_resource_id := v_sku_id::text;
  insert into public.v2_catalogue_admin_changes (
    actor_user_id, resource_type, resource_id, action, before_state, after_state
  ) values (
    p_actor_user_id,
    'pricing_sku',
    v_resource_id,
    case when v_before is null then 'create' else 'update' end,
    v_before,
    v_after
  );

  if nullif(p_sku->'metadata'->>'source_key', '') is not null then
    insert into public.v2_catalogue_source_overrides (
      source_type, source_key, disposition, actor_user_id, resource_id, updated_at
    ) values (
      'pricing_rule', p_sku->'metadata'->>'source_key', 'database_managed', p_actor_user_id, v_resource_id, now()
    )
    on conflict (source_type, source_key) do update set
      disposition = excluded.disposition,
      actor_user_id = excluded.actor_user_id,
      resource_id = excluded.resource_id,
      updated_at = now();
  end if;

  return v_after;
end;
$$;

revoke all on function public.mutate_v2_admin_pricing_sku(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_v2_admin_pricing_sku(uuid, text, text, jsonb)
  to service_role;


create or replace function public.mutate_v2_admin_model_graph(p_actor_user_id uuid,p_model_slug text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  perform set_config('phaseo.catalogue_actor', p_actor_user_id::text, true);
  select to_jsonb(t) into v_before from public.v2_models t where model_slug=p_model_slug for update;
  if v_before is null then raise exception 'model not found'; end if;

  update public.v2_models set
    name=coalesce(p_payload->>'name',name), lab_slug=coalesce(p_payload->>'organisation_id',lab_slug),
    status=coalesce(lower(p_payload->>'status'),status), hidden=coalesce((p_payload->>'hidden')::boolean,hidden),
    family_slug=case when p_payload ? 'family_id' then nullif(p_payload->>'family_id','') else family_slug end,
    input_modalities=case when p_payload ? 'input_types' then string_to_array(coalesce(p_payload->>'input_types',''),',') else input_modalities end,
    output_modalities=case when p_payload ? 'output_types' then string_to_array(coalesce(p_payload->>'output_types',''),',') else output_modalities end,
    announced_at=case when p_payload ? 'announcement_date' then nullif(p_payload->>'announcement_date','')::timestamptz else announced_at end,
    released_at=case when p_payload ? 'release_date' then nullif(p_payload->>'release_date','')::timestamptz else released_at end,
    deprecated_at=case when p_payload ? 'deprecation_date' then nullif(p_payload->>'deprecation_date','')::timestamptz else deprecated_at end,
    retired_at=case when p_payload ? 'retirement_date' then nullif(p_payload->>'retirement_date','')::timestamptz else retired_at end,
    metadata=metadata||jsonb_strip_nulls(jsonb_build_object('license',p_payload->>'license','previous_model_id',p_payload->>'previous_model_id','source','admin')),updated_at=now()
  where model_slug=p_model_slug;

  if p_payload ? 'family' then
    insert into public.v2_model_families(family_slug,lab_slug,name,metadata,updated_at)
    values(p_payload->'family'->>'family_id',(select lab_slug from public.v2_models where model_slug=p_model_slug),p_payload->'family'->>'family_name',jsonb_strip_nulls(jsonb_build_object('description',p_payload->'family'->>'family_description','source','admin')),now())
    on conflict(family_slug) do update set name=excluded.name,metadata=public.v2_model_families.metadata||excluded.metadata,updated_at=now();
    update public.v2_models set family_slug=p_payload->'family'->>'family_id',updated_at=now() where model_slug=p_model_slug;
  end if;

  if p_payload ? 'model_details' then
    delete from public.v2_model_details where model_slug=p_model_slug;
    insert into public.v2_model_details(model_slug,detail_name,detail_value,detail_order)
    select p_model_slug,x->>'detail_name',coalesce(x->'detail_value',to_jsonb(x->>'detail_value')),100+row_number() over()
    from jsonb_array_elements(p_payload->'model_details') x;
  end if;
  if p_payload ? 'links' then
    delete from public.v2_model_links where model_slug=p_model_slug;
    insert into public.v2_model_links(model_slug,link_kind,title,url,metadata)
    select p_model_slug,coalesce(nullif(x->>'kind',''),x->>'platform'),coalesce(nullif(x->>'title',''),x->>'platform'),x->>'url',jsonb_build_object('source','admin') from jsonb_array_elements(p_payload->'links') x;
  end if;
  if p_payload ? 'benchmark_results' then
    if exists(select 1 from jsonb_array_elements(p_payload->'benchmark_results') x
      join public.v2_benchmark_results r on r.result_id::text=x->>'id' where r.model_slug<>p_model_slug)
      then raise exception 'benchmark result belongs to another model'; end if;
    insert into public.v2_benchmark_results(result_id,model_slug,benchmark_id,score,score_numeric,is_self_reported,other_info,source_link,variant,effective_to,updated_at)
    select coalesce(nullif(x->>'id','')::uuid,gen_random_uuid()),p_model_slug,x->>'benchmark_id',x->>'score',
      case when (x->>'score')~'^[-+]?[0-9]*\.?[0-9]+$' then (x->>'score')::numeric end,
      coalesce((x->>'is_self_reported')::boolean,false),nullif(x->>'other_info',''),nullif(x->>'source_link',''),nullif(x->>'variant',''),nullif(x->>'effective_to','')::timestamptz,now()
    from jsonb_array_elements(p_payload->'benchmark_results') x
    on conflict(result_id) do update set benchmark_id=excluded.benchmark_id,score=excluded.score,score_numeric=excluded.score_numeric,
      is_self_reported=excluded.is_self_reported,other_info=excluded.other_info,source_link=excluded.source_link,variant=excluded.variant,effective_to=excluded.effective_to,updated_at=now();
  end if;
  if p_payload ? 'subscription_plan_models' then
    insert into public.v2_subscription_plan_models(plan_uuid,model_slug,model_info,rate_limit,other_info,effective_to)
    select (x->>'plan_uuid')::uuid,p_model_slug,coalesce(x->'model_info','{}'::jsonb),coalesce(x->'rate_limit','{}'::jsonb),coalesce(x->'other_info','{}'::jsonb),nullif(x->>'effective_to','')::timestamptz
    from jsonb_array_elements(p_payload->'subscription_plan_models') x
    on conflict(plan_uuid,model_slug) do update set model_info=excluded.model_info,rate_limit=excluded.rate_limit,other_info=excluded.other_info,effective_to=excluded.effective_to;
  end if;
  if p_payload ? 'provider_models' then
    if exists(select 1 from jsonb_array_elements(p_payload->'provider_models') x
      join public.v2_model_provider_routes r on r.provider_model_id=x->>'id'
      where r.model_slug<>p_model_slug) then raise exception 'provider route belongs to another model'; end if;
    insert into public.v2_model_provider_routes(provider_model_id,model_slug,provider_slug,provider_model_slug,status,routing_enabled,input_modalities,output_modalities,context_length,max_output_tokens,effective_from,effective_to,metadata,updated_at)
    select
      case when coalesce(x->>'id','') like 'new-%' or coalesce(x->>'id','')='' then (x->>'provider_id')||':'||p_model_slug||':'||coalesce(nullif(x->>'provider_model_slug',''),x->>'api_model_id') else x->>'id' end,
      p_model_slug,x->>'provider_id',coalesce(nullif(x->>'provider_model_slug',''),x->>'api_model_id'),'active',coalesce((x->>'is_active_gateway')::boolean,false),
      case when jsonb_typeof(x->'input_modalities')='array' then array(select jsonb_array_elements_text(x->'input_modalities')) else string_to_array(coalesce(x->>'input_modalities',''),',') end,
      case when jsonb_typeof(x->'output_modalities')='array' then array(select jsonb_array_elements_text(x->'output_modalities')) else string_to_array(coalesce(x->>'output_modalities',''),',') end,
      nullif(x->>'context_length','')::integer,nullif(x->>'max_output_tokens','')::integer,nullif(x->>'effective_from','')::timestamptz,nullif(x->>'effective_to','')::timestamptz,
      jsonb_strip_nulls(jsonb_build_object('prompt_training_policy_override',x->>'prompt_training_policy_override','prompt_training_override_notes',x->>'prompt_training_override_notes','prompt_training_override_source_url',x->>'prompt_training_override_source_url','quantization_scheme',x->>'quantization_scheme','source','admin')),now()
    from (
      select distinct on (
        case when coalesce(entry.value->>'id','') like 'new-%' or coalesce(entry.value->>'id','')=''
          then (entry.value->>'provider_id')||':'||p_model_slug||':'||coalesce(nullif(entry.value->>'provider_model_slug',''),entry.value->>'api_model_id')
          else entry.value->>'id' end
      ) entry.value
      from jsonb_array_elements(p_payload->'provider_models') with ordinality entry(value, position)
      order by
        case when coalesce(entry.value->>'id','') like 'new-%' or coalesce(entry.value->>'id','')=''
          then (entry.value->>'provider_id')||':'||p_model_slug||':'||coalesce(nullif(entry.value->>'provider_model_slug',''),entry.value->>'api_model_id')
          else entry.value->>'id' end,
        entry.position desc
    ) deduplicated(x)
    on conflict(provider_model_id) do update set provider_slug=excluded.provider_slug,provider_model_slug=excluded.provider_model_slug,status=public.v2_model_provider_routes.status,routing_enabled=excluded.routing_enabled,input_modalities=excluded.input_modalities,output_modalities=excluded.output_modalities,context_length=excluded.context_length,max_output_tokens=excluded.max_output_tokens,effective_from=excluded.effective_from,effective_to=excluded.effective_to,metadata=public.v2_model_provider_routes.metadata||excluded.metadata,updated_at=now();
  end if;
  if p_payload ? 'provider_capabilities' then
    if exists (
      select 1 from jsonb_array_elements(p_payload->'provider_capabilities') x
      where not exists (
        select 1 from public.v2_model_provider_routes route
        where route.model_slug=p_model_slug and route.provider_slug=x->>'provider_id'
          and route.provider_model_slug=coalesce(nullif(x->>'provider_model_slug',''),x->>'api_model_id') and (nullif(x->>'provider_model_id','') is null or route.provider_model_id=x->>'provider_model_id')
      )
    ) then raise exception 'provider capability does not match a model route'; end if;
    insert into public.v2_route_capabilities(provider_model_id,capability_id,status,params,effective_from,effective_to,metadata,updated_at)
    select route.provider_model_id,x->>'capability_id',case when x->>'status' like 'deranked_%' then 'degraded' else coalesce(nullif(x->>'status',''),'active') end,coalesce(x->'params','{}'::jsonb),nullif(x->>'effective_from','')::timestamptz,nullif(x->>'effective_to','')::timestamptz,jsonb_build_object('editor_status',x->>'status','source','admin'),now()
    from jsonb_array_elements(p_payload->'provider_capabilities') x join public.v2_model_provider_routes route on route.model_slug=p_model_slug and route.provider_slug=x->>'provider_id' and route.provider_model_slug=coalesce(nullif(x->>'provider_model_slug',''),x->>'api_model_id') and (nullif(x->>'provider_model_id','') is null or route.provider_model_id=x->>'provider_model_id')
    on conflict(provider_model_id,capability_id) do update set status=excluded.status,params=excluded.params,
      effective_from=excluded.effective_from,effective_to=excluded.effective_to,
      metadata=public.v2_route_capabilities.metadata||excluded.metadata,updated_at=now();
  end if;
  select to_jsonb(t) into v_after from public.v2_models t where model_slug=p_model_slug;
  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
  values(p_actor_user_id,'model_graph',p_model_slug,'save',v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
  values('model',p_model_slug,'database_managed',p_actor_user_id,p_model_slug,now()) on conflict(source_type,source_key) do update set disposition='database_managed',actor_user_id=excluded.actor_user_id,updated_at=now();
  return jsonb_build_object('model',v_after);
end $$;

revoke all on function public.mutate_v2_admin_model_graph(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_model_graph(uuid,text,jsonb) to service_role;

create or replace function public.mutate_v2_admin_provider_route(
  p_actor_user_id uuid,
  p_model_slug text,
  p_route jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_provider_slug text := nullif(trim(p_route->>'provider_slug'),'');
  v_provider_model_slug text := nullif(trim(p_route->>'provider_model_slug'),'');
  v_provider_model_id text := nullif(trim(p_route->>'provider_model_id'),'');
  v_before jsonb;
  v_after jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  if not exists(select 1 from public.v2_models where model_slug=p_model_slug) then raise exception 'model not found'; end if;
  if v_provider_slug is null or not exists(select 1 from public.v2_providers where provider_slug=v_provider_slug) then raise exception 'provider not found'; end if;
  if v_provider_model_slug is null then raise exception 'provider_model_slug is required'; end if;
  if v_provider_model_id is null then v_provider_model_id := v_provider_slug||':'||p_model_slug||':'||v_provider_model_slug; end if;
  select to_jsonb(t) into v_before from public.v2_model_provider_routes t where provider_model_id=v_provider_model_id for update;
  if v_before is not null and v_before->>'model_slug'<>p_model_slug then raise exception 'provider route belongs to another model'; end if;
  perform set_config('phaseo.catalogue_actor',p_actor_user_id::text,true);
  insert into public.v2_model_provider_routes(
    provider_model_id,model_slug,provider_slug,provider_model_slug,status,
    provider_availability_status,phaseo_status,access_scope,routing_enabled,
    input_modalities,output_modalities,regions,context_length,max_output_tokens,
    effective_from,effective_to,metadata,updated_at
  ) values (
    v_provider_model_id,p_model_slug,v_provider_slug,v_provider_model_slug,
    coalesce(nullif(p_route->>'status',''),'active'),
    coalesce(nullif(p_route->>'provider_availability_status',''),'unknown'),
    coalesce(nullif(p_route->>'phaseo_status',''),'disabled'),
    coalesce(nullif(p_route->>'access_scope',''),'public'),
    coalesce((p_route->>'routing_enabled')::boolean,false),
    case when jsonb_typeof(p_route->'input_modalities')='array' then array(select jsonb_array_elements_text(p_route->'input_modalities')) else '{}'::text[] end,
    case when jsonb_typeof(p_route->'output_modalities')='array' then array(select jsonb_array_elements_text(p_route->'output_modalities')) else '{}'::text[] end,
    case when jsonb_typeof(p_route->'regions')='array' then array(select jsonb_array_elements_text(p_route->'regions')) else '{}'::text[] end,
    nullif(p_route->>'context_length','')::integer,nullif(p_route->>'max_output_tokens','')::integer,
    nullif(p_route->>'effective_from','')::timestamptz,nullif(p_route->>'effective_to','')::timestamptz,
    coalesce(p_route->'metadata','{}'::jsonb)||jsonb_build_object('source','admin'),now()
  ) on conflict(provider_model_id) do update set
    provider_slug=excluded.provider_slug,provider_model_slug=excluded.provider_model_slug,status=excluded.status,
    provider_availability_status=case when p_route ? 'provider_availability_status' then excluded.provider_availability_status else public.v2_model_provider_routes.provider_availability_status end,
    phaseo_status=case when p_route ? 'phaseo_status' then excluded.phaseo_status else public.v2_model_provider_routes.phaseo_status end,
    access_scope=case when p_route ? 'access_scope' then excluded.access_scope else public.v2_model_provider_routes.access_scope end,
    routing_enabled=excluded.routing_enabled,
    input_modalities=excluded.input_modalities,output_modalities=excluded.output_modalities,
    regions=excluded.regions,context_length=excluded.context_length,max_output_tokens=excluded.max_output_tokens,
    effective_from=excluded.effective_from,effective_to=excluded.effective_to,
    metadata=public.v2_model_provider_routes.metadata||excluded.metadata,updated_at=now();
  if exists(
    select 1 from public.v2_model_provider_routes t
    where t.provider_model_id=v_provider_model_id and t.routing_enabled
      and (t.phaseo_status <> 'enabled' or t.access_scope <> 'public'
        or t.provider_availability_status not in ('available','preview','limited_access'))
  ) then raise exception 'routing requires an enabled public route with available provider access'; end if;
  select to_jsonb(t) into v_after from public.v2_model_provider_routes t where provider_model_id=v_provider_model_id;
  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
  values(p_actor_user_id,'provider_route',v_provider_model_id,case when v_before is null then 'create' else 'update' end,v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
  values('provider_route',v_provider_model_id,'database_managed',p_actor_user_id,v_provider_model_id,now())
  on conflict(source_type,source_key) do update set disposition='database_managed',actor_user_id=excluded.actor_user_id,resource_id=excluded.resource_id,updated_at=now();
  return v_after;
end $$;

revoke all on function public.mutate_v2_admin_provider_route(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_provider_route(uuid,text,jsonb) to service_role;


create or replace function public.mutate_v2_admin_model_aliases(
  p_actor_user_id uuid,
  p_model_slug text,
  p_aliases jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  if not exists(select 1 from public.v2_models where model_slug=p_model_slug) then raise exception 'model not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by alias_slug),'[]'::jsonb) into v_before from public.v2_model_aliases t where model_slug=p_model_slug;
  perform set_config('phaseo.catalogue_actor',p_actor_user_id::text,true);
  if exists(select 1 from jsonb_array_elements(p_aliases) x join public.v2_model_aliases a on a.alias_slug=lower(trim(x->>'alias_slug')) where a.model_slug<>p_model_slug) then raise exception 'alias belongs to another model'; end if;
  insert into public.v2_model_aliases(alias_slug,model_slug,alias_type,enabled,effective_from,effective_to,metadata,updated_at)
  select lower(trim(x->>'alias_slug')),p_model_slug,coalesce(nullif(x->>'alias_type',''),'public'),coalesce((x->>'enabled')::boolean,true),nullif(x->>'effective_from','')::timestamptz,nullif(x->>'effective_to','')::timestamptz,coalesce(x->'metadata','{}'::jsonb)||jsonb_build_object('source','admin'),now()
  from jsonb_array_elements(coalesce(p_aliases,'[]'::jsonb)) x
  on conflict(alias_slug) do update set alias_type=excluded.alias_type,enabled=excluded.enabled,effective_from=excluded.effective_from,effective_to=excluded.effective_to,metadata=excluded.metadata,updated_at=now();
  select coalesce(jsonb_agg(to_jsonb(t) order by alias_slug),'[]'::jsonb) into v_after from public.v2_model_aliases t where model_slug=p_model_slug;
  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
  values(p_actor_user_id,'model_aliases',p_model_slug,'save',v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
  values('model',p_model_slug,'database_managed',p_actor_user_id,p_model_slug,now())
  on conflict(source_type,source_key) do update set disposition='database_managed',actor_user_id=excluded.actor_user_id,resource_id=excluded.resource_id,updated_at=now();
  return v_after;
end $$;

revoke all on function public.mutate_v2_admin_model_aliases(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_model_aliases(uuid,text,jsonb) to service_role;

create or replace function public.get_v2_model_benchmarks(p_model_slug text)
returns table (
  result_id uuid, benchmark_id text, score text, score_numeric numeric, is_self_reported boolean,
  other_info text, source_link text, result_rank integer, occur_idx integer, variant text, result_key text,
  benchmark_name text, category text, link text, total_models integer, ascending_order boolean, benchmark_type text,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security invoker set search_path = public
as $$
  select result.result_id, result.benchmark_id, result.score, result.score_numeric, result.is_self_reported,
    result.other_info, result.source_link, result.rank, result.occur_idx, result.variant, result.result_key,
    benchmark.name, benchmark.category, benchmark.link, benchmark.total_models, benchmark.ascending_order,
    benchmark.benchmark_type, result.created_at, result.updated_at
  from public.v2_benchmark_results result
  join public.v2_benchmarks benchmark on benchmark.benchmark_id = result.benchmark_id
  where result.model_slug = lower(trim(p_model_slug)) and (result.effective_to is null or result.effective_to>now())
  order by benchmark.name, result.rank nulls last, result.created_at desc;
$$;
grant execute on function public.get_v2_model_benchmarks(text) to anon, authenticated, service_role;

create or replace function public.get_v2_model_subscription_plans(p_model_slug text)
returns table (
  plan_uuid uuid, plan_id text, name text, lab_slug text, description text, link text, other_info jsonb,
  created_at timestamptz, updated_at timestamptz, model_info jsonb, rate_limit jsonb, model_other_info jsonb,
  price numeric, currency text, frequency text
)
language sql stable security invoker set search_path = public
as $$
  select plan.plan_uuid, plan.plan_id, plan.name, plan.lab_slug, plan.description, plan.link, plan.other_info,
    plan.created_at, plan.updated_at, relation.model_info, relation.rate_limit, relation.other_info,
    plan.price, plan.currency, plan.frequency
  from public.v2_subscription_plan_models relation
  join public.v2_subscription_plans plan on plan.plan_uuid = relation.plan_uuid
  where relation.model_slug = lower(trim(p_model_slug)) and (relation.effective_to is null or relation.effective_to>now())
  order by plan.plan_id, plan.frequency;
$$;
grant execute on function public.get_v2_model_subscription_plans(text) to anon, authenticated, service_role;

