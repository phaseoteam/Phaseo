-- Providers declare the request and token limits they impose on Phaseo through their catalogue,
-- without review. Writes replace a provider's rows atomically and bump the routing catalogue
-- revision so gateways pick up new limits without waiting for the configuration TTL.
-- phaseo:allow-destructive-migration reason: Adds a column, a statement trigger (whose event list names TRUNCATE and DELETE) and a function that replaces one provider's provider_rate_limits rows when called; this migration itself deletes or truncates no data, and provider_rate_limits is empty in production.
SET local check_function_bodies = off;

ALTER TABLE "public"."provider_catalog_sources"
  ADD COLUMN "rate_limits_updated_at" timestamp WITH time zone;

COMMENT ON COLUMN "public"."provider_catalog_sources"."rate_limits_updated_at" IS 'Version of the provider-declared provider_rate_limits rows; null until the provider first declares limits.';

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.provider_rate_limits
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

COMMENT ON TABLE "public"."provider_rate_limits" IS 'Upstream provider capacity limits declared by each provider through its catalogue, counted globally across all users. A provider and model that reaches a limit is heavily deranked in routing rather than excluded.';

CREATE OR REPLACE FUNCTION public.save_provider_rate_limits(
  p_provider_slug text, p_actor_id uuid, p_actor_kind text, p_expected_version timestamptz, p_limits jsonb, p_check_version boolean DEFAULT true
) RETURNS timestamptz LANGUAGE plpgsql SET search_path TO 'public' AS $function$
declare
  source public.provider_catalog_sources%rowtype;
  item jsonb;
  limit_key text;
  limit_value numeric;
  desired jsonb;
  previous jsonb;
  all_enabled boolean;
  actor_name text;
  saved_version timestamptz;
begin
  select * into source from public.provider_catalog_sources where provider_slug=p_provider_slug for update;
  if not found then raise exception 'provider_catalog_source_not_found'; end if;
  -- Feed imports have no signed-in actor and replace the declared limits wholesale.
  if p_actor_kind not in ('phaseo','provider') or (p_check_version and p_actor_id is null) then raise exception 'provider_catalog_actor_required'; end if;
  if p_check_version and p_expected_version is distinct from source.rate_limits_updated_at then raise exception 'provider_catalog_version_conflict'; end if;
  if jsonb_typeof(p_limits) is distinct from 'array' or jsonb_array_length(p_limits) > 1000 then raise exception 'provider_rate_limits_invalid'; end if;
  for item in select value from jsonb_array_elements(p_limits) loop
    if jsonb_typeof(item) <> 'object'
      or exists (select 1 from jsonb_object_keys(item) key where key not in ('model','requests_per_minute','requests_per_day','tokens_per_minute','tokens_per_day'))
      or (item ? 'model' and jsonb_typeof(item->'model') not in ('string','null'))
      or btrim(coalesce(item->>'model','*'))='' or length(item->>'model')>2000 then
      raise exception 'provider_rate_limits_invalid';
    end if;
    for limit_key in select unnest(array['requests_per_minute','requests_per_day','tokens_per_minute','tokens_per_day']) loop
      if jsonb_typeof(item->limit_key) not in ('number','null') then raise exception 'provider_rate_limits_invalid'; end if;
      limit_value := (item->>limit_key)::numeric;
      if limit_value is not null and (limit_value <= 0 or limit_value <> trunc(limit_value) or limit_value > 9007199254740991) then raise exception 'provider_rate_limits_invalid'; end if;
    end loop;
    if coalesce(item->>'requests_per_minute',item->>'requests_per_day',item->>'tokens_per_minute',item->>'tokens_per_day') is null then raise exception 'provider_rate_limits_empty_scope'; end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
      'model',scope.model,
      'requests_per_minute',to_jsonb((scope.item->>'requests_per_minute')::bigint),
      'requests_per_day',to_jsonb((scope.item->>'requests_per_day')::bigint),
      'tokens_per_minute',to_jsonb((scope.item->>'tokens_per_minute')::bigint),
      'tokens_per_day',to_jsonb((scope.item->>'tokens_per_day')::bigint)
    ) order by scope.model),'[]'::jsonb)
  into desired
  from (select coalesce(entry->>'model','*') as model, entry as item from jsonb_array_elements(p_limits) entry) scope;
  if (select count(*) <> count(distinct value->>'model') from jsonb_array_elements(desired)) then raise exception 'provider_rate_limits_duplicate_scope'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'model',limits.provider_model_slug,
      'requests_per_minute',to_jsonb(limits.requests_per_minute),
      'requests_per_day',to_jsonb(limits.requests_per_day),
      'tokens_per_minute',to_jsonb(limits.tokens_per_minute),
      'tokens_per_day',to_jsonb(limits.tokens_per_day)
    ) order by limits.provider_model_slug),'[]'::jsonb), coalesce(bool_and(limits.enabled),true)
  into previous, all_enabled
  from public.provider_rate_limits limits where limits.provider_id=p_provider_slug;
  -- Unchanged declarations leave rows, audit history and the routing catalogue revision untouched.
  -- A provider saving them again re-enables disabled rows; a feed re-import never does.
  if previous=desired and (all_enabled or not p_check_version) then return source.rate_limits_updated_at; end if;
  delete from public.provider_rate_limits limits
  where limits.provider_id=p_provider_slug
    and not exists (select 1 from jsonb_array_elements(desired) scope where scope->>'model'=limits.provider_model_slug);
  insert into public.provider_rate_limits(provider_id,provider_model_slug,requests_per_minute,requests_per_day,tokens_per_minute,tokens_per_day,enabled,updated_at)
  select p_provider_slug, scope->>'model', (scope->>'requests_per_minute')::bigint, (scope->>'requests_per_day')::bigint,
    (scope->>'tokens_per_minute')::bigint, (scope->>'tokens_per_day')::bigint, true, now()
  from jsonb_array_elements(desired) scope
  on conflict (provider_id,provider_model_slug) do update set
    requests_per_minute=excluded.requests_per_minute, requests_per_day=excluded.requests_per_day,
    tokens_per_minute=excluded.tokens_per_minute, tokens_per_day=excluded.tokens_per_day,
    enabled=true, updated_at=now();
  select display_name into actor_name from public.users where user_id=p_actor_id;
  insert into public.provider_catalog_edit_events(provider_slug,model_slug,field,actor_id,actor_kind,actor_name,action,previous_value,value)
  values(p_provider_slug,'*','$rate_limits',p_actor_id,p_actor_kind,actor_name,'override',previous,desired);
  update public.provider_catalog_sources set rate_limits_updated_at=now() where provider_slug=p_provider_slug returning rate_limits_updated_at into saved_version;
  return saved_version;
end;
$function$;
REVOKE ALL ON FUNCTION public.save_provider_rate_limits(text,uuid,text,timestamptz,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_provider_rate_limits(text,uuid,text,timestamptz,jsonb,boolean) TO service_role;
