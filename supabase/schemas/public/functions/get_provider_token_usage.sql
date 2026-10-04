CREATE OR REPLACE FUNCTION public.get_provider_token_usage (
  provider_id text,
  since_ts    timestamp with time zone
)
  RETURNS TABLE (
    total_tokens bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
	select coalesce(
		sum(
			NULLIF(
				usage->>'total_tokens',
				''
			)::bigint
		),
		0
	) as total_tokens
	from gateway_requests
	where provider = provider_id
	  and created_at >= since_ts;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_provider_token_usage"(text, timestamp WITH time zone) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_provider_token_usage"(text, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_provider_token_usage"(text, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_provider_token_usage"(text, timestamp WITH time zone) TO "postgres";
