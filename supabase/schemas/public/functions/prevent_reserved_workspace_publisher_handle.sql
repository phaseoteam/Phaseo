CREATE OR REPLACE FUNCTION public.prevent_reserved_workspace_publisher_handle()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  new.publisher_handle := lower(trim(new.publisher_handle));
  if exists (
    select 1 from public.workspace_publisher_handle_aliases alias
    where alias.handle = new.publisher_handle
      and alias.workspace_id <> new.id
  ) then
    raise exception 'publisher_handle_reserved' using errcode = '23505';
  end if;
  return new;
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."prevent_reserved_workspace_publisher_handle"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."prevent_reserved_workspace_publisher_handle"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_reserved_workspace_publisher_handle"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."prevent_reserved_workspace_publisher_handle"() FROM PUBLIC, "anon", "authenticated";
