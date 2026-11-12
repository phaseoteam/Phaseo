CREATE OR REPLACE FUNCTION public.validate_workspace_billing_time_zone()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  new.billing_time_zone := pg_catalog.btrim(new.billing_time_zone);
  -- The default needs no lookup; every other value must be a zone the server knows.
  if new.billing_time_zone is distinct from 'UTC'
    and not private.is_valid_time_zone(new.billing_time_zone) then
    raise exception 'invalid_time_zone'
      using errcode = '22023',
        detail = pg_catalog.format('%s is not an IANA time zone.', new.billing_time_zone);
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."validate_workspace_billing_time_zone"() TO "service_role";

COMMENT ON FUNCTION "public"."validate_workspace_billing_time_zone"() IS 'Rejects a workspace_settings.billing_time_zone that is not an IANA time zone (private.is_valid_time_zone). Definer rights let admins writing through RLS use the private helper.';

REVOKE ALL ON FUNCTION "public"."validate_workspace_billing_time_zone"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_workspace_billing_time_zone"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."validate_workspace_billing_time_zone"() FROM PUBLIC, "anon", "authenticated";
