CREATE OR REPLACE FUNCTION public.remove_preset_version_label (
  p_preset_id   uuid,
  p_label       text,
  actor_user_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare p public.presets%rowtype; removed integer;
begin
  select * into p from public.presets where id = p_preset_id and archived_at is null;
  if not found then raise exception 'preset_not_found'; end if;
  if p.created_by is distinct from actor_user_id and (
    coalesce(p.draft_visibility, p.visibility) = 'private' or not exists (
      select 1 from public.workspace_members member
      where member.workspace_id = p.workspace_id
        and member.user_id = actor_user_id
        and member.role in ('owner', 'admin')
    )
  ) then raise exception 'preset_label_forbidden'; end if;
  delete from public.preset_version_labels l where l.preset_id = p.id and l.label = lower(btrim(coalesce(p_label, '')));
  get diagnostics removed = row_count;
  return removed > 0;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."remove_preset_version_label"(uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."remove_preset_version_label"(uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."remove_preset_version_label"(uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."remove_preset_version_label"(uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";
