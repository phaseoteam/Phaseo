CREATE OR REPLACE FUNCTION public.finish_preset_creation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare initial_version_id uuid;
begin
  insert into public.preset_lineage values (new.id, new.id, 0) on conflict do nothing;
  if new.source_preset_id is not null then
    insert into public.preset_lineage (ancestor_preset_id, descendant_preset_id, depth)
    select ancestor_preset_id, new.id, depth + 1 from public.preset_lineage
    where descendant_preset_id = new.source_preset_id on conflict do nothing;
  end if;
  insert into public.preset_versions (preset_id, version_number, version_label, versioning_method, name, slug, description, config, visibility, created_by)
  values (new.id, 1, case new.versioning_method when 'semver' then '1.0.0' when 'date' then to_char(current_date, 'YYYY.MM.DD') else 'v1' end, new.versioning_method, new.name, new.slug, new.description, new.config, new.visibility, new.created_by)
  returning id into initial_version_id;
  update public.presets set
    draft_name = new.name, draft_slug = new.slug, draft_description = new.description,
    draft_config = new.config, draft_visibility = new.visibility, active_version_id = initial_version_id
  where id = new.id;
  return new;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."finish_preset_creation"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."finish_preset_creation"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."finish_preset_creation"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."finish_preset_creation"() FROM PUBLIC, "anon", "authenticated";
