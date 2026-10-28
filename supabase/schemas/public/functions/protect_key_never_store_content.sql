CREATE OR REPLACE FUNCTION public.protect_key_never_store_content()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  -- One-way: a key created to never have its content stored keeps that promise
  -- for every later request, whoever edits the key.
  if old.never_store_content and not new.never_store_content then
    raise exception 'key_never_store_content_locked'
      using errcode = '23514',
        detail = 'This key never has its request or response content stored. Create a new key instead.';
  end if;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."protect_key_never_store_content"() IS 'Stops a key''s never_store_content from being turned off once it is on.';

REVOKE ALL ON FUNCTION "public"."protect_key_never_store_content"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_key_never_store_content"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_key_never_store_content"() FROM PUBLIC, "anon", "authenticated", "service_role";
