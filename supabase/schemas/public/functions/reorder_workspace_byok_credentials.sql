CREATE OR REPLACE FUNCTION public.reorder_workspace_byok_credentials (
  p_workspace_id uuid,
  p_provider_id  text,
  p_routing_mode text,
  p_key_ids      uuid[]
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  expected_count integer;
  supplied_count integer;
begin
  if p_routing_mode not in ('priority', 'fallback') then
    return false;
  end if;

  select count(*) into expected_count
  from public.byok_keys
  where workspace_id = p_workspace_id
    and provider_id = p_provider_id
    and routing_mode = p_routing_mode;

  select count(distinct key_id) into supplied_count
  from unnest(p_key_ids) as key_id;

  if expected_count = 0
    or supplied_count <> expected_count
    or cardinality(p_key_ids) <> expected_count
    or exists (
      select 1
      from unnest(p_key_ids) as supplied(key_id)
      left join public.byok_keys credential
        on credential.id = supplied.key_id
        and credential.workspace_id = p_workspace_id
        and credential.provider_id = p_provider_id
        and credential.routing_mode = p_routing_mode
      where credential.id is null
    )
  then
    return false;
  end if;

  update public.byok_keys credential
  set sort_order = ordered.ordinality - 1
  from unnest(p_key_ids) with ordinality as ordered(key_id, ordinality)
  where credential.id = ordered.key_id
    and credential.workspace_id = p_workspace_id;

  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."reorder_workspace_byok_credentials"(uuid, text, text, uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."reorder_workspace_byok_credentials"(uuid, text, text, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reorder_workspace_byok_credentials"(uuid, text, text, uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."reorder_workspace_byok_credentials"(uuid, text, text, uuid[]) FROM PUBLIC, "anon", "authenticated";
