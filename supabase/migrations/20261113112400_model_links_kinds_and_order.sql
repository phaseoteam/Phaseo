-- phaseo:allow-destructive-migration reason: merges model link kinds into a fixed list. A link is removed only when the same model already has the same URL under the kind it is being renamed to; on 2026-11-13 that is two rows on unbiased/pareto (official_website and official_model_card, duplicating website and model_card). The re-created mutate_v2_admin_model_graph keeps its existing delete-and-reinsert of a model's links and details.

-- Model links: a fixed list of kinds and an explicit display order.
-- Each link is a URL plus a display title. The kind now comes from a short fixed list and is used
-- only for grouping, the default icon and the comparison columns; the title is what people see.
-- sort_order records the order links are shown in; the admin editor saves it from the list order.

SET local check_function_bodies = off;

ALTER TABLE public.v2_model_links
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

CREATE TEMPORARY TABLE model_link_kind_map AS
SELECT model_slug, link_kind, url, CASE
    WHEN link_kind IN ('release', 'release_notes', 'news', 'event') THEN 'announcement'
    WHEN link_kind = 'api' THEN 'api_reference'
    WHEN link_kind IN ('docs', 'guide', 'usage', 'privacy') THEN 'documentation'
    WHEN link_kind IN ('official_model_card', 'system_card') THEN 'model_card'
    WHEN link_kind = 'hugging_face' THEN 'weights'
    WHEN link_kind = 'github' THEN 'repository'
    WHEN link_kind = 'source' AND url ~* '^https?://(www\.)?github\.com/' THEN 'repository'
    WHEN link_kind = 'source' THEN 'announcement'
    WHEN link_kind = 'model' AND url ~* '^https?://(www\.)?huggingface\.co/' THEN 'weights'
    WHEN link_kind IN ('model', 'provider_model', 'provider_models', 'provider_endpoint', 'catalogue', 'byteplus') THEN 'provider'
    WHEN link_kind = 'official_pricing' THEN 'pricing'
    WHEN link_kind IN ('homepage', 'official_website') THEN 'website'
    ELSE link_kind
  END AS new_kind
FROM public.v2_model_links;

-- Remove rows whose URL is already stored under the kind they are about to be renamed to,
-- keeping the row that already has that kind.
DELETE FROM public.v2_model_links link
USING (
  SELECT model_slug, link_kind, url,
    row_number() OVER (PARTITION BY model_slug, new_kind, url ORDER BY (link_kind = new_kind) DESC, link_kind) AS rank
  FROM model_link_kind_map
) duplicate
WHERE duplicate.rank > 1
  AND link.model_slug = duplicate.model_slug
  AND link.link_kind = duplicate.link_kind
  AND link.url = duplicate.url;

UPDATE public.v2_model_links link
SET link_kind = map.new_kind,
  updated_at = now()
FROM model_link_kind_map map
WHERE link.model_slug = map.model_slug
  AND link.link_kind = map.link_kind
  AND link.url = map.url
  AND map.link_kind <> map.new_kind;

-- Kinds outside the list above are kept only if they are already valid; anything else becomes a website link.
UPDATE public.v2_model_links
SET link_kind = 'website', updated_at = now()
WHERE link_kind NOT IN (
  'announcement', 'model_card', 'paper', 'weights', 'repository', 'documentation',
  'api_reference', 'playground', 'pricing', 'benchmark', 'website', 'provider',
  'deprecation', 'license'
)
AND NOT EXISTS (
  SELECT 1 FROM public.v2_model_links other
  WHERE other.model_slug = v2_model_links.model_slug
    AND other.link_kind = 'website'
    AND other.url = v2_model_links.url
);

DELETE FROM public.v2_model_links
WHERE link_kind NOT IN (
  'announcement', 'model_card', 'paper', 'weights', 'repository', 'documentation',
  'api_reference', 'playground', 'pricing', 'benchmark', 'website', 'provider',
  'deprecation', 'license'
);

DROP TABLE model_link_kind_map;

-- Start every model in the same order the model page used before: by kind, then title.
UPDATE public.v2_model_links link
SET sort_order = ordered.position * 10
FROM (
  SELECT model_slug, link_kind, url,
    row_number() OVER (
      PARTITION BY model_slug
      ORDER BY array_position(ARRAY[
        'announcement', 'model_card', 'paper', 'weights', 'repository', 'documentation',
        'api_reference', 'playground', 'pricing', 'benchmark', 'website', 'provider',
        'deprecation', 'license'
      ]::text[], link_kind), title, url
    ) AS position
  FROM public.v2_model_links
) ordered
WHERE link.model_slug = ordered.model_slug
  AND link.link_kind = ordered.link_kind
  AND link.url = ordered.url;

ALTER TABLE public.v2_model_links
  ADD CONSTRAINT v2_model_links_link_kind_check CHECK (link_kind IN (
    'announcement', 'model_card', 'paper', 'weights', 'repository', 'documentation',
    'api_reference', 'playground', 'pricing', 'benchmark', 'website', 'provider',
    'deprecation', 'license'
  ));

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
    insert into public.v2_model_links(model_slug,link_kind,title,url,sort_order,metadata)
    select p_model_slug,lower(trim(coalesce(nullif(x.value->>'kind',''),x.value->>'platform'))),
      coalesce(nullif(trim(x.value->>'title'),''),nullif(x.value->>'platform',''),x.value->>'kind'),trim(x.value->>'url'),
      (x.position*10)::integer,jsonb_build_object('source','admin')
    from jsonb_array_elements(p_payload->'links') with ordinality x(value, position)
    on conflict(model_slug,link_kind,url) do nothing;
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
    select route.provider_model_id,x->>'capability_id',case when x->>'status' like 'deranked%' then 'degraded' else coalesce(nullif(x->>'status',''),'active') end,coalesce(x->'params','{}'::jsonb),nullif(x->>'effective_from','')::timestamptz,nullif(x->>'effective_to','')::timestamptz,jsonb_build_object('editor_status',x->>'status','source','admin'),now()
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
