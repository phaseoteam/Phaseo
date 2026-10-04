CREATE OR REPLACE FUNCTION public.resolve_public_model_id (
  p_model_id text,
  p_provider text DEFAULT NULL::text
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
with direct_match as (
  select dm.model_id as canonical_model_id
  from private.v2_rpc_models_compat dm
  where dm.model_id = p_model_id
  limit 1
),
alias_match as (
  select a.api_model_id as canonical_model_id
  from (select alias_slug, model_slug as api_model_id, enabled as is_enabled, effective_from, effective_to, metadata, created_at, updated_at from public.v2_model_aliases) a
  where a.alias_slug = p_model_id
    and coalesce(a.is_enabled, true)
  limit 1
),
provider_match as (
  select coalesce(nullif(pm.model_id, ''), pm.api_model_id) as canonical_model_id,
         pm.is_active_gateway,
         pm.updated_at
  from private.v2_rpc_routes_compat pm
  where (p_provider is null or pm.provider_id = p_provider)
    and (
      pm.model_id = p_model_id
      or pm.api_model_id = p_model_id
      or pm.provider_api_model_id = p_model_id
      or pm.provider_model_slug = p_model_id
    )
  order by pm.is_active_gateway desc, pm.updated_at desc nulls last
  limit 1
)
select canonical_model_id
from (
  select 0 as ord, canonical_model_id from direct_match
  union all
  select 1 as ord, canonical_model_id from alias_match
  union all
  select 2 as ord, canonical_model_id from provider_match
) candidates
where canonical_model_id is not null
  and btrim(canonical_model_id) <> ''
order by ord
limit 1;
$function$;

GRANT EXECUTE ON FUNCTION "public"."resolve_public_model_id"(text, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."resolve_public_model_id"(text, text) TO "service_role";

COMMENT ON FUNCTION "public"."resolve_public_model_id"(text, text) IS 'Resolves canonical public model ids from canonical ids, aliases, and provider-facing model identifiers only.';

REVOKE ALL ON FUNCTION "public"."resolve_public_model_id"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_public_model_id"(text, text) TO "postgres";
