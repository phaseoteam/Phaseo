CREATE OR REPLACE FUNCTION public.mutate_v2_admin_model_graph (
  p_actor_user_id uuid,
  p_model_slug    text,
  p_payload       jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
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
end $function$;

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_model_graph"(uuid, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_model_graph"(uuid, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_model_graph"(uuid, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_model_graph"(uuid, text, jsonb) FROM PUBLIC, "anon", "authenticated";
