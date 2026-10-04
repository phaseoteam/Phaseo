CREATE OR REPLACE FUNCTION public.marketplace_preset_fork_counts (
  preset_ids uuid[]
)
  RETURNS TABLE (
    preset_id         uuid,
    fork_count        bigint,
    direct_fork_count bigint,
    descendant_count  bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select requested.id,
    (select count(*) from public.presets direct where direct.source_preset_id = requested.id and direct.archived_at is null),
    (select count(*) from public.presets direct where direct.source_preset_id = requested.id and direct.archived_at is null),
    (select count(*) from public.preset_lineage lineage join public.presets child on child.id = lineage.descendant_preset_id
      where lineage.ancestor_preset_id = requested.id and lineage.depth > 0 and child.archived_at is null)
  from unnest(preset_ids) requested(id);
$function$;

GRANT EXECUTE ON FUNCTION "public"."marketplace_preset_fork_counts"(uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."marketplace_preset_fork_counts"(uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."marketplace_preset_fork_counts"(uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."marketplace_preset_fork_counts"(uuid[]) FROM PUBLIC, "anon", "authenticated";
