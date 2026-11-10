-- A service-role-only lookup for dashboard preset routes: the preset, only if it is live, in a workspace the
-- user belongs to or owns, and not someone else's private preset. It replaces listing the user's workspaces into
-- a request filter (capped at 1,000 rows), and keeps a hidden preset indistinguishable from a missing one.

CREATE OR REPLACE FUNCTION public.find_member_visible_preset (
  p_preset_id uuid,
  p_user_id   uuid
)
  RETURNS SETOF public.presets
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The preset a dashboard request may act on: live, in a workspace the user belongs to (or owns), and not
  -- someone else's private preset. A hidden preset and a missing one both return no row from this one
  -- query, and membership is checked here instead of being listed into the request.
  select preset.*
  from public.presets preset
  where preset.id = p_preset_id
    and preset.archived_at is null
    and (preset.visibility <> 'private' or preset.created_by = p_user_id)
    and (
      exists (select 1 from public.workspace_members member where member.workspace_id = preset.workspace_id and member.user_id = p_user_id)
      or exists (select 1 from public.workspaces workspace where workspace.id = preset.workspace_id and workspace.owner_user_id = p_user_id)
    );
$function$;

REVOKE ALL ON FUNCTION "public"."find_member_visible_preset"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."find_member_visible_preset"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."find_member_visible_preset"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."find_member_visible_preset"(uuid, uuid) TO "service_role";
