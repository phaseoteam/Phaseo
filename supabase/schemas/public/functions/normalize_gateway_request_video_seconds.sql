CREATE OR REPLACE FUNCTION public.normalize_gateway_request_video_seconds()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  new.usage_video_seconds := greatest(
    coalesce(
      public.gateway_usage_numeric_field(
        new.usage,
        'video_seconds',
        'input_video_seconds',
        'output_video_seconds'
      ),
      new.usage_video_seconds,
      0
    ),
    0
  );
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."normalize_gateway_request_video_seconds"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."normalize_gateway_request_video_seconds"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."normalize_gateway_request_video_seconds"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."normalize_gateway_request_video_seconds"() FROM PUBLIC, "anon", "authenticated";
