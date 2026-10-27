SET local check_function_bodies = off;

-- Weekly token totals were 0: the v2 request compat view rebuilds usage from
-- numeric meter quantities, so values arrive as "406.000000000000". Accept
-- decimal strings as well as integers and cast through numeric.

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
      when coalesce(p_usage->>'total_tokens', '') ~ '^\d+(\.\d+)?$'
        then (p_usage->>'total_tokens')::numeric::bigint
      else null
    end,
    greatest(
      coalesce(case when coalesce(p_usage->>'input_text_tokens', '') ~ '^\d+(\.\d+)?$' then (p_usage->>'input_text_tokens')::numeric::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'input_tokens', '') ~ '^\d+(\.\d+)?$' then (p_usage->>'input_tokens')::numeric::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'prompt_tokens', '') ~ '^\d+(\.\d+)?$' then (p_usage->>'prompt_tokens')::numeric::bigint end, 0)
    )
    + greatest(
      coalesce(case when coalesce(p_usage->>'output_text_tokens', '') ~ '^\d+(\.\d+)?$' then (p_usage->>'output_text_tokens')::numeric::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'output_tokens', '') ~ '^\d+(\.\d+)?$' then (p_usage->>'output_tokens')::numeric::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'completion_tokens', '') ~ '^\d+(\.\d+)?$' then (p_usage->>'completion_tokens')::numeric::bigint end, 0)
    )
    + coalesce(case when coalesce(p_usage->>'reasoning_tokens', '') ~ '^\d+(\.\d+)?$' then (p_usage->>'reasoning_tokens')::numeric::bigint end, 0)
    + coalesce(case when coalesce(p_usage->>'cached_read_text_tokens', '') ~ '^\d+(\.\d+)?$' then (p_usage->>'cached_read_text_tokens')::numeric::bigint end, 0),
    0
  );
$function$;
