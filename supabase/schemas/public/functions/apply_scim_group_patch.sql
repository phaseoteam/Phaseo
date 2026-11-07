CREATE OR REPLACE FUNCTION public.apply_scim_group_patch (
  p_workspace_id uuid,
  p_group_id     uuid,
  p_changes      jsonb
)
  RETURNS public.scim_groups
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  change jsonb;
  change_kind text;
  member_ids uuid[];
  patched public.scim_groups;
begin
  -- Every operation of one SCIM PATCH, and the group's metadata change, apply in one transaction: a
  -- later operation failing (or a deadlock) rolls back the earlier ones, so "add the new member, remove
  -- the old one" can never stop halfway with both in a group that mappings make admins.
  if not exists(select 1 from public.scim_groups where id=p_group_id and workspace_id=p_workspace_id) then raise exception 'SCIM group not found' using errcode='P0002'; end if;
  perform set_config('phaseo.scim_group_replace','on',true);
  for change in select value from jsonb_array_elements(coalesce(p_changes,'[]'::jsonb)) loop
    change_kind := change->>'kind';
    if change_kind = 'attributes' then
      update public.scim_groups set
        display_name = case when change->'values' ? 'display_name' then change->'values'->>'display_name' else display_name end,
        external_id = case when change->'values' ? 'external_id' then change->'values'->>'external_id' else external_id end
      where id=p_group_id and workspace_id=p_workspace_id;
      continue;
    end if;
    select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into member_ids from jsonb_array_elements_text(coalesce(change->'user_ids','[]'::jsonb));
    if change_kind in ('members-replace','members-add')
       and exists(select 1 from unnest(member_ids) candidate(user_id) where not exists(select 1 from public.scim_users where id=candidate.user_id and workspace_id=p_workspace_id)) then
      raise exception 'SCIM user not found in workspace' using errcode='23503';
    end if;
    if change_kind = 'members-replace' then
      delete from public.scim_group_members where workspace_id=p_workspace_id and group_id=p_group_id;
      insert into public.scim_group_members(workspace_id,group_id,user_id) select p_workspace_id,p_group_id,user_id from unnest(member_ids) user_id;
    elsif change_kind = 'members-add' then
      insert into public.scim_group_members(workspace_id,group_id,user_id) select p_workspace_id,p_group_id,user_id from unnest(member_ids) user_id
      on conflict (group_id,user_id) do nothing;
    elsif change_kind = 'members-remove' then
      delete from public.scim_group_members where workspace_id=p_workspace_id and group_id=p_group_id and user_id=any(member_ids);
    else
      raise exception 'Unsupported SCIM Group PATCH change: %', change_kind using errcode='22023';
    end if;
  end loop;
  update public.scim_groups set updated_at=now() where id=p_group_id and workspace_id=p_workspace_id returning * into patched;
  perform public.reconcile_scim_entitlements(p_workspace_id);
  -- The per-row triggers are off for this bulk write, so owner role overrides are reapplied here.
  perform public.apply_workspace_role_overrides(p_workspace_id);
  perform set_config('phaseo.scim_group_replace','off',true);
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,null,'scim_group_patch');
  return patched;
end;
$function$;

COMMENT ON FUNCTION "public"."apply_scim_group_patch"(uuid, uuid, jsonb) IS 'Applies all operations of one SCIM Group PATCH (attributes and member add/remove/replace) and the metadata change in one transaction, then reconciles directory entitlements once.';

GRANT EXECUTE ON FUNCTION "public"."apply_scim_group_patch"(uuid, uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_scim_group_patch"(uuid, uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_scim_group_patch"(uuid, uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_scim_group_patch"(uuid, uuid, jsonb) FROM PUBLIC, "anon", "authenticated";
