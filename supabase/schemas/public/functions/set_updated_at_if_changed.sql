CREATE OR REPLACE FUNCTION public.set_updated_at_if_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  -- Only bump updated_at if some column changed,
  -- and we haven't already set updated_at in this trigger.
  if row(NEW.*) is distinct from row(OLD.*)
     and NEW.updated_at is not distinct from OLD.updated_at then
    NEW.updated_at := now();
  end if;
  return NEW;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_updated_at_if_changed"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at_if_changed"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_updated_at_if_changed"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at_if_changed"() TO "postgres";
