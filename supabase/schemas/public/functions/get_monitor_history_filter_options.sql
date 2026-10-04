CREATE OR REPLACE FUNCTION public.get_monitor_history_filter_options()
  RETURNS TABLE (
    option_kind  text,
    option_value text,
    option_label text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  (
    select
      'model'::text as option_kind,
      e.model_id as option_value,
      e.model_label as option_label
    from public.monitor_history_events e
    where e.model_id is not null
      and btrim(e.model_id) <> ''
    group by e.model_id, e.model_label
  )
  union all
  (
    select
      'provider'::text as option_kind,
      e.provider_slug as option_value,
      e.provider_label as option_label
    from public.monitor_history_events e
    where e.provider_slug is not null
      and btrim(e.provider_slug) <> ''
    group by e.provider_slug, e.provider_label
  )
  order by option_kind asc, option_label asc, option_value asc;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_monitor_history_filter_options"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_monitor_history_filter_options"() TO "service_role";

COMMENT ON FUNCTION "public"."get_monitor_history_filter_options"() IS 'Returns distinct model and provider options for the monitor history filters.';

REVOKE ALL ON FUNCTION "public"."get_monitor_history_filter_options"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_monitor_history_filter_options"() TO "postgres";
