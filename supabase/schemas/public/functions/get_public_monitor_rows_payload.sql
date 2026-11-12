CREATE OR REPLACE FUNCTION public.get_public_monitor_rows_payload()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select coalesce(jsonb_agg(
    to_jsonb(row) || jsonb_build_object('model_license', nullif(btrim(model.license), ''))
  ), '[]'::jsonb)
  from public.get_monitor_model_rows(false) as row
  left join public.v2_models model on model.model_slug = row.model_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_monitor_rows_payload"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_monitor_rows_payload"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_monitor_rows_payload"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_monitor_rows_payload"() FROM PUBLIC, "anon", "authenticated";
