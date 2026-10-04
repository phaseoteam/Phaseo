CREATE OR REPLACE FUNCTION public.prepare_preset_lineage()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare source_row public.presets%rowtype;
begin
  if new.source_preset_id is null then
    new.root_preset_id := new.id;
    new.fork_depth := 0;
    return new;
  end if;
  select * into source_row from public.presets where id = new.source_preset_id;
  if not found then raise exception 'source_preset_not_found'; end if;
  new.root_preset_id := coalesce(source_row.root_preset_id, source_row.id);
  new.fork_depth := source_row.fork_depth + 1;
  new.source_preset_version_id := coalesce(new.source_preset_version_id, source_row.active_version_id);
  new.upstream_version_id := coalesce(new.upstream_version_id, source_row.active_version_id);
  return new;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."prepare_preset_lineage"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."prepare_preset_lineage"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prepare_preset_lineage"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."prepare_preset_lineage"() FROM PUBLIC, "anon", "authenticated";
