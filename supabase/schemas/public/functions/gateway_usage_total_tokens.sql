CREATE OR REPLACE FUNCTION public.gateway_usage_total_tokens (
  p_usage jsonb
)
  RETURNS bigint
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select coalesce(
    case
      when coalesce(p_usage->>'total_tokens', '') ~ '^\d+$'
        then (p_usage->>'total_tokens')::bigint
      else null
    end,
    greatest(
      coalesce(case when coalesce(p_usage->>'input_text_tokens', '') ~ '^\d+$' then (p_usage->>'input_text_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'input_tokens', '') ~ '^\d+$' then (p_usage->>'input_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'prompt_tokens', '') ~ '^\d+$' then (p_usage->>'prompt_tokens')::bigint end, 0)
    )
    + greatest(
      coalesce(case when coalesce(p_usage->>'output_text_tokens', '') ~ '^\d+$' then (p_usage->>'output_text_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'output_tokens', '') ~ '^\d+$' then (p_usage->>'output_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'completion_tokens', '') ~ '^\d+$' then (p_usage->>'completion_tokens')::bigint end, 0)
    )
    + coalesce(case when coalesce(p_usage->>'reasoning_tokens', '') ~ '^\d+$' then (p_usage->>'reasoning_tokens')::bigint end, 0)
    + coalesce(case when coalesce(p_usage->>'cached_read_text_tokens', '') ~ '^\d+$' then (p_usage->>'cached_read_text_tokens')::bigint end, 0),
    0
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_usage_total_tokens"(jsonb) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."gateway_usage_total_tokens"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_usage_total_tokens"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_usage_total_tokens"(jsonb) TO "postgres";
