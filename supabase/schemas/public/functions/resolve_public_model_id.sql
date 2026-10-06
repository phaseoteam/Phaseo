create or replace function public.resolve_public_model_id(p_model_id text, p_provider text default null)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  resolved text;
begin
  select dm.model_id into resolved
  from private.v2_rpc_models_compat dm
  where dm.model_id = p_model_id limit 1;
  if resolved is not null and btrim(resolved) <> '' then return resolved; end if;

  select a.model_slug into resolved
  from public.v2_model_aliases a
  where a.alias_slug = p_model_id and coalesce(a.enabled, true) limit 1;
  if resolved is not null and btrim(resolved) <> '' then return resolved; end if;

  select coalesce(nullif(pm.model_id, ''), pm.api_model_id) into resolved
  from private.v2_rpc_routes_compat pm
  where (p_provider is null or pm.provider_id = p_provider)
    and (pm.model_id = p_model_id or pm.api_model_id = p_model_id
      or pm.provider_api_model_id = p_model_id or pm.provider_model_slug = p_model_id)
  order by pm.is_active_gateway desc, pm.updated_at desc nulls last limit 1;
  if resolved is not null and btrim(resolved) <> '' then return resolved; end if;
  return null;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."resolve_public_model_id"(text, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."resolve_public_model_id"(text, text) TO "service_role";

COMMENT ON FUNCTION "public"."resolve_public_model_id"(text, text) IS 'Resolves canonical public model ids from canonical ids, aliases, and provider-facing model identifiers only.';

REVOKE ALL ON FUNCTION "public"."resolve_public_model_id"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_public_model_id"(text, text) TO "postgres";
