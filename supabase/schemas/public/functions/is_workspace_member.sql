CREATE OR REPLACE FUNCTION public.is_workspace_member (
  p_team_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = p_team_id
        and wm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.workspaces w
      where w.id = p_team_id
        and w.owner_user_id = auth.uid()
    );
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_workspace_member"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."is_workspace_member"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_workspace_member"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_workspace_member"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."is_workspace_member"(uuid) FROM PUBLIC, "anon";
