CREATE OR REPLACE FUNCTION public.get_public_country_summaries()
  RETURNS TABLE (
    iso                 text,
    total_organisations bigint,
    total_models        bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select
    upper(btrim(organisation.country_code)) as iso,
    count(distinct organisation.organisation_id)::bigint as total_organisations,
    count(model.model_id)::bigint as total_models
  from private.v2_rpc_labs_compat organisation
  left join private.v2_rpc_models_compat model
    on model.organisation_id = organisation.organisation_id
    and model.hidden = false
  where organisation.country_code is not null
    and btrim(organisation.country_code) <> ''
  group by upper(btrim(organisation.country_code))
  order by total_models desc, iso;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_country_summaries"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_country_summaries"() TO "service_role";

COMMENT ON FUNCTION "public"."get_public_country_summaries"() IS 'Returns compact public country counts for the country index without materializing nested model catalogues.';

REVOKE ALL ON FUNCTION "public"."get_public_country_summaries"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_country_summaries"() TO "postgres";
