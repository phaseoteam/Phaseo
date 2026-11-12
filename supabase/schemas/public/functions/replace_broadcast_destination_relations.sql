CREATE OR REPLACE FUNCTION public.replace_broadcast_destination_relations (
  p_workspace_id   uuid,
  p_destination_id uuid,
  p_filters        jsonb DEFAULT NULL::jsonb,
  p_groups         jsonb DEFAULT NULL::jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  group_row record;
  created_group_id uuid;
begin
  if not exists (
    select 1 from public.workspace_broadcast_destinations
    where id = p_destination_id and workspace_id = p_workspace_id
  ) then
    raise exception 'observability_destination_not_found';
  end if;

  if p_filters is not null then
    if jsonb_typeof(p_filters) <> 'array' then raise exception 'invalid_destination_filters'; end if;
    delete from public.broadcast_destination_keys where destination_id = p_destination_id;
    insert into public.broadcast_destination_keys (destination_id, key_id, filter_mode)
    select p_destination_id, (item->>'key_id')::uuid, item->>'mode'
    from jsonb_array_elements(p_filters) item;
  end if;

  if p_groups is not null then
    if jsonb_typeof(p_groups) <> 'array' then raise exception 'invalid_destination_rule_groups'; end if;
    delete from public.broadcast_destination_rule_groups where destination_id = p_destination_id;
    for group_row in
      select item, ordinality - 1 as position
      from jsonb_array_elements(p_groups) with ordinality as groups(item, ordinality)
    loop
      insert into public.broadcast_destination_rule_groups (
        destination_id, name, match_operator, position
      ) values (
        p_destination_id,
        'Group ' || (group_row.position + 1),
        group_row.item->>'match',
        group_row.position
      ) returning id into created_group_id;

      insert into public.broadcast_destination_rules (
        rule_group_id, field, condition, value, position
      )
      select
        created_group_id,
        rule->>'field',
        rule->>'condition',
        rule->>'value',
        ordinality - 1
      from jsonb_array_elements(group_row.item->'rules') with ordinality as rules(rule, ordinality);
    end loop;
  end if;

  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."replace_broadcast_destination_relations"(uuid, uuid, jsonb, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."replace_broadcast_destination_relations"(uuid, uuid, jsonb, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."replace_broadcast_destination_relations"(uuid, uuid, jsonb, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."replace_broadcast_destination_relations"(uuid, uuid, jsonb, jsonb) FROM PUBLIC, "anon", "authenticated";
