CREATE OR REPLACE FUNCTION public.mutate_v2_admin_catalogue (
  p_actor_user_id uuid,
  p_resource_type text,
  p_action        text,
  p_resource_id   text,
  p_payload       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_before jsonb; v_after jsonb; v_uuid uuid;
begin
  if not exists (select 1 from public.users where user_id = p_actor_user_id and lower(coalesce(role::text, '')) = 'admin') then raise exception 'actor must have the admin role'; end if;
  if p_action not in ('create','update','delete') then raise exception 'unsupported catalogue action'; end if;

  if p_resource_type = 'organisations' then
    select to_jsonb(t) into v_before from public.v2_labs t where lab_slug = p_resource_id;
    if p_action = 'delete' then delete from public.v2_labs where lab_slug = p_resource_id;
    else
      insert into public.v2_labs (lab_slug,name,country_code,subdivision_code,description,status,metadata,updated_at)
      values (p_resource_id,p_payload->>'name',coalesce(nullif(p_payload->>'country_code',''),'xx'),nullif(p_payload->>'subdivision_code',''),nullif(p_payload->>'description',''),'active',jsonb_strip_nulls(jsonb_build_object('colour',p_payload->>'colour','source','admin')),now())
      on conflict (lab_slug) do update set name=excluded.name,country_code=excluded.country_code,subdivision_code=excluded.subdivision_code,description=excluded.description,metadata=public.v2_labs.metadata||excluded.metadata,updated_at=now();
      delete from public.v2_lab_links where lab_slug=p_resource_id;
      insert into public.v2_lab_links(lab_slug,platform,url) select p_resource_id,x->>'platform',x->>'url' from jsonb_array_elements(coalesce(p_payload->'social_links','[]'::jsonb)) x;
    end if;
    select to_jsonb(t) into v_after from public.v2_labs t where lab_slug = p_resource_id;
  elsif p_resource_type = 'providers' then
    select to_jsonb(t) into v_before from public.v2_providers t where provider_slug=p_resource_id;
    if p_action='delete' then delete from public.v2_providers where provider_slug=p_resource_id;
    else
      insert into public.v2_providers(provider_slug,name,status,country_code,subdivision_code,base_url,default_execution_regions,byok_available,metadata,updated_at)
      values(p_resource_id,p_payload->>'api_provider_name',lower(coalesce(nullif(p_payload->>'status',''),'active')),coalesce(nullif(p_payload->>'country_code',''),'xx'),nullif(p_payload->>'subdivision_code',''),nullif(p_payload->>'link',''),case when jsonb_typeof(p_payload->'default_execution_regions') = 'array' then array(select jsonb_array_elements_text(p_payload->'default_execution_regions')) else null end,coalesce((p_payload->>'byok_available')::boolean,false),jsonb_strip_nulls(jsonb_build_object('description',p_payload->>'description','prompt_training_policy',p_payload->>'prompt_training_policy','prompt_training_notes',p_payload->>'prompt_training_notes','prompt_training_source_url',p_payload->>'prompt_training_source_url','data_policy_tier',p_payload->>'data_policy_tier','data_policy_confidence',p_payload->>'data_policy_confidence','data_policy_contract_mode',p_payload->>'data_policy_contract_mode','data_policy_contract_notes',p_payload->>'data_policy_contract_notes','source','admin')),now())
      on conflict(provider_slug) do update set name=excluded.name,status=excluded.status,country_code=excluded.country_code,subdivision_code=excluded.subdivision_code,base_url=excluded.base_url,default_execution_regions=case when p_payload ? 'default_execution_regions' then excluded.default_execution_regions else public.v2_providers.default_execution_regions end,byok_available=case when p_payload ? 'byok_available' then excluded.byok_available else public.v2_providers.byok_available end,metadata=public.v2_providers.metadata||excluded.metadata,updated_at=now();
    end if;
    select to_jsonb(t) into v_after from public.v2_providers t where provider_slug=p_resource_id;
  elsif p_resource_type = 'benchmarks' then
    select to_jsonb(t) into v_before from public.v2_benchmarks t where benchmark_id=p_resource_id;
    if p_action='delete' then delete from public.v2_benchmarks where benchmark_id=p_resource_id;
    else
      insert into public.v2_benchmarks(benchmark_id,name,category,link,ascending_order,updated_at)
      values(p_resource_id,p_payload->>'name',nullif(p_payload->>'category',''),nullif(p_payload->>'link',''),coalesce((p_payload->>'ascending_order')::boolean,false),now())
      on conflict(benchmark_id) do update set name=excluded.name,category=excluded.category,link=excluded.link,ascending_order=excluded.ascending_order,updated_at=now();
    end if;
    select to_jsonb(t) into v_after from public.v2_benchmarks t where benchmark_id=p_resource_id;
  elsif p_resource_type = 'subscription-plans' then
    begin
      v_uuid := p_resource_id::uuid;
    exception when invalid_text_representation then
      raise exception 'subscription plan id must be a UUID';
    end;
    select to_jsonb(t) into v_before from public.v2_subscription_plans t where plan_uuid=v_uuid;
    if p_action='delete' then delete from public.v2_subscription_plans where plan_uuid=v_uuid;
    else
      insert into public.v2_subscription_plans(plan_uuid,plan_id,name,lab_slug,description,frequency,price,currency,link,other_info,updated_at)
      values(v_uuid,p_payload->>'plan_id',p_payload->>'name',nullif(p_payload->>'organisation_id',''),nullif(p_payload->>'description',''),nullif(p_payload->>'frequency',''),nullif(p_payload->>'price','')::numeric,nullif(p_payload->>'currency',''),nullif(p_payload->>'link',''),coalesce(p_payload->'other_info','{}'::jsonb)||jsonb_build_object('source','admin'),now())
      on conflict(plan_uuid) do update set plan_id=excluded.plan_id,name=excluded.name,lab_slug=excluded.lab_slug,description=excluded.description,frequency=excluded.frequency,price=excluded.price,currency=excluded.currency,link=excluded.link,other_info=public.v2_subscription_plans.other_info||excluded.other_info,updated_at=now();
    end if;
    select to_jsonb(t) into v_after from public.v2_subscription_plans t where plan_uuid=v_uuid;
  elsif p_resource_type = 'models' then
    select to_jsonb(t) into v_before from public.v2_models t where model_slug=p_resource_id;
    if p_action='delete' then delete from public.v2_models where model_slug=p_resource_id;
    else
      insert into public.v2_models(model_slug,lab_slug,name,status,hidden,input_modalities,output_modalities,family_slug,announced_at,released_at,deprecated_at,retired_at,metadata,updated_at)
      values(p_resource_id,p_payload->>'organisationId',p_payload->>'name',lower(coalesce(nullif(p_payload->>'status',''),'active')),coalesce((p_payload->>'hidden')::boolean,false),string_to_array(coalesce(p_payload->>'inputTypes',''),','),string_to_array(coalesce(p_payload->>'outputTypes',''),','),nullif(p_payload->>'familyId',''),nullif(p_payload->>'announcementDate','')::timestamptz,nullif(p_payload->>'releaseDate','')::timestamptz,nullif(p_payload->>'deprecationDate','')::timestamptz,nullif(p_payload->>'retirementDate','')::timestamptz,jsonb_strip_nulls(jsonb_build_object('license',p_payload->>'license','previous_model_id',p_payload->>'previousModelId','source','admin')),now())
      on conflict(model_slug) do update set lab_slug=case when p_payload ? 'organisationId' then excluded.lab_slug else public.v2_models.lab_slug end,name=coalesce(p_payload->>'name',public.v2_models.name),status=case when p_payload ? 'status' then excluded.status else public.v2_models.status end,hidden=case when p_payload ? 'hidden' then excluded.hidden else public.v2_models.hidden end,input_modalities=case when p_payload ? 'inputTypes' then excluded.input_modalities else public.v2_models.input_modalities end,output_modalities=case when p_payload ? 'outputTypes' then excluded.output_modalities else public.v2_models.output_modalities end,family_slug=case when p_payload ? 'familyId' then excluded.family_slug else public.v2_models.family_slug end,announced_at=case when p_payload ? 'announcementDate' then excluded.announced_at else public.v2_models.announced_at end,released_at=case when p_payload ? 'releaseDate' then excluded.released_at else public.v2_models.released_at end,deprecated_at=case when p_payload ? 'deprecationDate' then excluded.deprecated_at else public.v2_models.deprecated_at end,retired_at=case when p_payload ? 'retirementDate' then excluded.retired_at else public.v2_models.retired_at end,metadata=public.v2_models.metadata||excluded.metadata,updated_at=now();
    end if;
    select to_jsonb(t) into v_after from public.v2_models t where model_slug=p_resource_id;
  else raise exception 'unsupported catalogue resource'; end if;

  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
  values(p_actor_user_id,p_resource_type,p_resource_id,p_action,v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
  values(p_resource_type,p_resource_id,case when p_action='delete' then 'suppressed' else 'database_managed' end,p_actor_user_id,p_resource_id,now())
  on conflict(source_type,source_key) do update set disposition=excluded.disposition,actor_user_id=excluded.actor_user_id,resource_id=excluded.resource_id,updated_at=now();
  return jsonb_build_object('before',v_before,'after',v_after);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_catalogue"(uuid, text, text, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_catalogue"(uuid, text, text, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_catalogue"(uuid, text, text, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_catalogue"(uuid, text, text, text, jsonb) FROM PUBLIC, "anon", "authenticated";
