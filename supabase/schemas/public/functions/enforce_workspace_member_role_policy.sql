CREATE OR REPLACE FUNCTION public.enforce_workspace_member_role_policy()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_owner_user_id uuid;
begin
  select w.owner_user_id
    into v_owner_user_id
  from public.workspaces w
  where w.id = new.workspace_id;

  if v_owner_user_id is null then
    raise exception using
      errcode = '23514',
      message = 'workspace_not_found_for_membership';
  end if;

  if new.user_id = v_owner_user_id then
    new.role := 'owner'::public.workspace_role;
    return new;
  end if;

  if lower(coalesce(new.role::text, '')) = 'owner' then
    raise exception using
      errcode = '23514',
      message = 'owner_role_reserved_for_workspace_owner',
      detail = 'Only workspaces.owner_user_id may have role=owner.';
  end if;

  if lower(coalesce(new.role::text, '')) not in ('admin', 'member') then
    raise exception using
      errcode = '23514',
      message = 'invalid_workspace_member_role',
      detail = 'Assignable roles are admin and member.';
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_member_role_policy"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_member_role_policy"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_member_role_policy"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_member_role_policy"() FROM PUBLIC, "anon", "authenticated";
