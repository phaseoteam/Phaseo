CREATE OR REPLACE FUNCTION public.set_preset_version_label (
  p_preset_id   uuid,
  p_label       text,
  p_version_id  uuid,
  actor_user_id uuid
)
  RETURNS public.preset_version_labels
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare p public.presets%rowtype; normalized text := lower(btrim(coalesce(p_label, ''))); saved public.preset_version_labels%rowtype;
begin
  select * into p from public.presets where id = p_preset_id and archived_at is null;
  if not found then raise exception 'preset_not_found'; end if;
  -- Same rule as publish_preset_version: a label decides what requests run.
  if p.created_by is distinct from actor_user_id and (
    coalesce(p.draft_visibility, p.visibility) = 'private' or not exists (
      select 1 from public.workspace_members member
      where member.workspace_id = p.workspace_id
        and member.user_id = actor_user_id
        and member.role in ('owner', 'admin')
    )
  ) then raise exception 'preset_label_forbidden'; end if;
  if normalized !~ '^[a-z][a-z0-9_-]{0,31}$' or normalized ~ '^v[0-9]+$' then raise exception 'invalid_preset_label'; end if;
  if not exists (select 1 from public.preset_versions v where v.id = p_version_id and v.preset_id = p.id) then
    raise exception 'preset_version_not_found';
  end if;
  insert into public.preset_version_labels as l (preset_id, label, version_id, updated_by)
  values (p.id, normalized, p_version_id, actor_user_id)
  on conflict (preset_id, label) do update
    set version_id = excluded.version_id, updated_by = excluded.updated_by, updated_at = now()
  returning * into saved;
  return saved;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."set_preset_version_label"(uuid, text, uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_preset_version_label"(uuid, text, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_preset_version_label"(uuid, text, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_preset_version_label"(uuid, text, uuid, uuid) FROM PUBLIC, "anon", "authenticated";
