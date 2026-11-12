CREATE OR REPLACE FUNCTION public.replace_gateway_dynamic_route_keys (
  p_route_id    uuid,
  p_key_ids     uuid[],
  p_attached_by uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if exists (
    select 1
    from unnest(coalesce(p_key_ids, '{}'::uuid[])) requested(key_id)
    left join public.keys gateway_key on gateway_key.id = requested.key_id
    left join public.gateway_dynamic_routes route on route.id = p_route_id
    where gateway_key.id is null
      or route.id is null
      or gateway_key.workspace_id <> route.workspace_id
  ) then
    raise exception 'dynamic_route_key_workspace_mismatch';
  end if;

  delete from public.gateway_dynamic_route_keys
  where route_id = p_route_id
    or key_id = any(coalesce(p_key_ids, '{}'::uuid[]));

  insert into public.gateway_dynamic_route_keys (route_id, key_id, attached_by)
  select p_route_id, requested.key_id, p_attached_by
  from unnest(coalesce(p_key_ids, '{}'::uuid[])) requested(key_id);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."replace_gateway_dynamic_route_keys"(uuid, uuid[], uuid) TO "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."replace_gateway_dynamic_route_keys"(uuid, uuid[], uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."replace_gateway_dynamic_route_keys"(uuid, uuid[], uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."replace_gateway_dynamic_route_keys"(uuid, uuid[], uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."replace_gateway_dynamic_route_keys"(uuid, uuid[], uuid) TO "postgres";
