CREATE OR REPLACE FUNCTION public.is_active_invite_for_workspace (
  p_invite_id uuid,
  p_team_id   uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select auth.uid() is not null and exists (
    select 1 from public.workspace_invites i
    where i.id = p_invite_id and i.workspace_id = p_team_id
      and (i.expires_at is null or i.expires_at > now())
      and (i.max_uses is null or coalesce(i.uses_count, 0) < i.max_uses)
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_active_invite_for_workspace"(uuid, uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."is_active_invite_for_workspace"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_active_invite_for_workspace"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_active_invite_for_workspace"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."is_active_invite_for_workspace"(uuid, uuid) FROM PUBLIC, "anon";
