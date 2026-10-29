CREATE OR REPLACE FUNCTION public.active_workload_identity_issuers ()
  RETURNS text[]
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select coalesce(array_agg(distinct policy.issuer order by policy.issuer), array[]::text[])
  from public.workload_identity_policies policy
  where policy.status = 'active';
$function$;

GRANT EXECUTE ON FUNCTION "public"."active_workload_identity_issuers"() TO "service_role";

COMMENT ON FUNCTION "public"."active_workload_identity_issuers"() IS 'Issuers named by at least one active workload identity policy. The gateway fetches signing keys only for these, so tokens naming any other Vercel team cannot make it fetch keys. Returns one array so the result is never cut off by a row limit.';

REVOKE ALL ON FUNCTION "public"."active_workload_identity_issuers"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."active_workload_identity_issuers"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."active_workload_identity_issuers"() FROM PUBLIC, "anon", "authenticated";
