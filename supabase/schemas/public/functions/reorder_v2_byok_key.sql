CREATE OR REPLACE FUNCTION public.reorder_v2_byok_key (
  p_workspace_id uuid,
  p_key_id       uuid,
  p_direction    text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  current_key public.byok_keys%rowtype;
  adjacent_key public.byok_keys%rowtype;
begin
  if p_direction not in ('up', 'down') then
    raise exception using errcode = '22023', message = 'invalid_direction';
  end if;
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  select * into current_key
  from public.byok_keys
  where id = p_key_id and workspace_id = p_workspace_id
  for update;
  if not found then return false; end if;

  if p_direction = 'up' then
    select * into adjacent_key
    from public.byok_keys
    where workspace_id = current_key.workspace_id
      and provider_id = current_key.provider_id
      and routing_mode = current_key.routing_mode
      and (sort_order, created_at, id) < (current_key.sort_order, current_key.created_at, current_key.id)
    order by sort_order desc, created_at desc, id desc
    limit 1
    for update;
  else
    select * into adjacent_key
    from public.byok_keys
    where workspace_id = current_key.workspace_id
      and provider_id = current_key.provider_id
      and routing_mode = current_key.routing_mode
      and (sort_order, created_at, id) > (current_key.sort_order, current_key.created_at, current_key.id)
    order by sort_order, created_at, id
    limit 1
    for update;
  end if;
  if not found then return true; end if;

  update public.byok_keys
  set sort_order = case
    when id = current_key.id then adjacent_key.sort_order
    else current_key.sort_order
  end
  where id in (current_key.id, adjacent_key.id);
  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."reorder_v2_byok_key"(uuid, uuid, text) TO "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."reorder_v2_byok_key"(uuid, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."reorder_v2_byok_key"(uuid, uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."reorder_v2_byok_key"(uuid, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reorder_v2_byok_key"(uuid, uuid, text) TO "postgres";
