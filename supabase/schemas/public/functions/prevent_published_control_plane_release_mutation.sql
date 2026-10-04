CREATE OR REPLACE FUNCTION public.prevent_published_control_plane_release_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  if old.published_once_at is not null then
    if tg_op = 'UPDATE'
      and new.status = 'superseded'
      and new.superseded_at is not null
      and (to_jsonb(new) - 'status' - 'superseded_at') =
        (to_jsonb(old) - 'status' - 'superseded_at') then
      return new;
    end if;
    raise exception 'Published control-plane releases are immutable';
  end if;
  if tg_op = 'UPDATE' and new.status = 'published' then
    new.published_once_at := coalesce(new.published_once_at, new.published_at, now());
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prevent_published_control_plane_release_mutation"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."prevent_published_control_plane_release_mutation"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_published_control_plane_release_mutation"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."prevent_published_control_plane_release_mutation"() FROM PUBLIC, "anon", "authenticated";
