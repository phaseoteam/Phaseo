CREATE OR REPLACE FUNCTION public.default_workspace_publisher_handle()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  if nullif(new.publisher_handle, '') is null then
    new.publisher_handle := lower(regexp_replace(regexp_replace(coalesce(nullif(new.slug, ''), new.name), '[^a-zA-Z0-9_-]+', '-', 'g'), '^-+|-+$', '', 'g'));

    if length(new.publisher_handle) < 3 then
      new.publisher_handle := 'workspace-' || left(new.id::text, 8);
    end if;

    new.publisher_handle := left(new.publisher_handle, 40);
  end if;

  return new;
end
$function$;

GRANT EXECUTE ON FUNCTION "public"."default_workspace_publisher_handle"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."default_workspace_publisher_handle"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."default_workspace_publisher_handle"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."default_workspace_publisher_handle"() FROM PUBLIC, "anon", "authenticated";
