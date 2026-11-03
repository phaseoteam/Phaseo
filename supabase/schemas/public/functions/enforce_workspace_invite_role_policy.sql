CREATE OR REPLACE FUNCTION public.enforce_workspace_invite_role_policy()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if lower(coalesce(new.role::text, '')) not in ('admin', 'member') then
    raise exception using
      errcode = '23514',
      message = 'invalid_workspace_invite_role',
      detail = 'Invite roles are restricted to admin and member.';
  end if;

  -- Like role changes, making someone an admin is the owner's call. Signed-in clients (admins can
  -- write invites through the Data API) may only create an admin invite, switch one to admin, or move
  -- one into a workspace as that workspace's owner; the service role (web-api checks the owner itself)
  -- has no auth.uid() and is not limited here.
  if new.role::text = 'admin'
    and (tg_op = 'INSERT' or old.role is distinct from new.role or old.workspace_id is distinct from new.workspace_id)
    and auth.uid() is not null
    and not exists (
      select 1 from public.workspaces w where w.id = new.workspace_id and w.owner_user_id = auth.uid()
    ) then
    raise exception using
      errcode = '42501',
      message = 'workspace_invite_admin_owner_only',
      detail = 'Only the workspace owner can invite admins.';
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_invite_role_policy"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_invite_role_policy"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_invite_role_policy"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_invite_role_policy"() FROM PUBLIC, "anon", "authenticated";
