CREATE OR REPLACE FUNCTION public.get_public_image_input_timeseries (
  p_time_range text    DEFAULT 'year'::text,
  p_top_n      integer DEFAULT 20
)
  RETURNS TABLE (
    bucket   timestamp with time zone,
    model_id text,
    requests bigint,
    tokens   numeric,
    colour   text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select series.*
  from public.get_public_modality_usage_timeseries(
    'image_inputs',
    coalesce(p_time_range, 'year'),
    greatest(1, least(coalesce(p_top_n, 20), 100))
  ) series;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_image_input_timeseries"(text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_image_input_timeseries"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_image_input_timeseries"(text, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_image_input_timeseries"(text, integer) FROM PUBLIC, "anon", "authenticated";
