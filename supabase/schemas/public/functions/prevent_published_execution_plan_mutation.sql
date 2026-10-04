CREATE OR REPLACE FUNCTION public.prevent_published_execution_plan_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  old_release_published_at timestamptz;
  new_release_published_at timestamptz;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select published_once_at into old_release_published_at
      from public.v2_control_plane_releases where release_id = old.release_id;
    if old_release_published_at is not null then
      raise exception 'Execution plans in published releases are immutable';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select published_once_at into new_release_published_at
      from public.v2_control_plane_releases where release_id = new.release_id;
    if new_release_published_at is not null then
      raise exception 'Execution plans in published releases are immutable';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prevent_published_execution_plan_mutation"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."prevent_published_execution_plan_mutation"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_published_execution_plan_mutation"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."prevent_published_execution_plan_mutation"() FROM PUBLIC, "anon", "authenticated";
