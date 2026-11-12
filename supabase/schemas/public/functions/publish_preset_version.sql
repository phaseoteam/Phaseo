CREATE OR REPLACE FUNCTION public.publish_preset_version (
  target_preset_id uuid,
  actor_user_id    uuid,
  notes            text DEFAULT NULL::text,
  requested_label  text DEFAULT NULL::text
)
  RETURNS public.preset_versions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare p public.presets%rowtype; next_number integer; next_label text; date_base text; date_count integer; published public.preset_versions%rowtype;
begin
  select * into p from public.presets where id = target_preset_id and archived_at is null for update;
  if not found then raise exception 'preset_not_found'; end if;
  if p.created_by <> actor_user_id and (
    coalesce(p.draft_visibility, p.visibility) = 'private' or not exists (
      select 1 from public.workspace_members member
      where member.workspace_id = p.workspace_id
        and member.user_id = actor_user_id
        and member.role in ('owner', 'admin')
    )
  ) then raise exception 'preset_publish_forbidden'; end if;
  select coalesce(max(version_number), 0) + 1 into next_number from public.preset_versions where preset_id = p.id;
  if p.versioning_method = 'semver' then
    next_label := regexp_replace(trim(coalesce(requested_label, '')), '^v', '');
    if next_label !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$' then raise exception 'invalid_semver_label'; end if;
  elsif p.versioning_method = 'date' then
    date_base := to_char(current_date, 'YYYY.MM.DD');
    select count(*) into date_count from public.preset_versions where preset_id = p.id and version_label like date_base || '%';
    next_label := case when date_count = 0 then date_base else date_base || '.' || (date_count + 1)::text end;
  else next_label := 'v' || next_number::text;
  end if;
  insert into public.preset_versions (preset_id, version_number, version_label, versioning_method, name, slug, description, config, visibility, release_notes, created_by)
  values (p.id, next_number, next_label, p.versioning_method, p.draft_name, p.draft_slug, p.draft_description, p.draft_config, p.draft_visibility, nullif(trim(notes), ''), actor_user_id)
  returning * into published;
  update public.presets set name = published.name, slug = published.slug, description = published.description,
    config = published.config, visibility = published.visibility, active_version_id = published.id, updated_at = now()
  where id = p.id;
  return published;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."publish_preset_version"(uuid, uuid, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."publish_preset_version"(uuid, uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_preset_version"(uuid, uuid, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."publish_preset_version"(uuid, uuid, text, text) FROM PUBLIC, "anon", "authenticated";
