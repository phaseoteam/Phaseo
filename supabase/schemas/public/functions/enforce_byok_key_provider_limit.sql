CREATE OR REPLACE FUNCTION public.enforce_byok_key_provider_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  existing_provider_count integer;
  existing_mode_count integer;
  excluded_key_id uuid;
begin
  if tg_op = 'UPDATE'
    and new.workspace_id is not distinct from old.workspace_id
    and new.provider_id is not distinct from old.provider_id
    and new.routing_mode is not distinct from old.routing_mode then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    excluded_key_id := old.id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.workspace_id::text || ':' || new.provider_id, 0)
  );

  select
    count(*),
    count(*) filter (where routing_mode = new.routing_mode)
  into existing_provider_count, existing_mode_count
  from public.byok_keys
  where workspace_id = new.workspace_id
    and provider_id = new.provider_id
    and (excluded_key_id is null or id <> excluded_key_id);

  if existing_provider_count >= 32 then
    raise exception 'BYOK key limit reached for workspace provider'
      using errcode = '23514';
  end if;
  if existing_mode_count >= 16 then
    raise exception 'BYOK key routing-mode limit reached for workspace provider'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_byok_key_provider_limit"() TO "service_role";

COMMENT ON FUNCTION "public"."enforce_byok_key_provider_limit"() IS 'Caps stored BYOK credentials at 32 per workspace/provider using a transaction-scoped advisory lock.';

REVOKE ALL ON FUNCTION "public"."enforce_byok_key_provider_limit"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_byok_key_provider_limit"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_byok_key_provider_limit"() FROM PUBLIC, "anon", "authenticated";
