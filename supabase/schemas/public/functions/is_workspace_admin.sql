CREATE OR REPLACE FUNCTION public.is_workspace_admin (
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
        and lower(coalesce(wm.role::text, '')) in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.workspaces w
      where w.id = p_team_id
        and w.owner_user_id = auth.uid()
    );
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_workspace_admin"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."is_workspace_admin"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_workspace_admin"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_workspace_admin"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."is_workspace_admin"(uuid) FROM PUBLIC, "anon";
