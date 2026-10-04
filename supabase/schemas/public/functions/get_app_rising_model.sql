CREATE OR REPLACE FUNCTION public.get_app_rising_model (
  p_app_id        uuid,
  p_recent_days   integer DEFAULT 7,
  p_previous_days integer DEFAULT 7
)
  RETURNS TABLE (
    model_id        text,
    provider        text,
    recent_tokens   bigint,
    previous_tokens bigint,
    delta_tokens    bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  with recent as (
    select
      coalesce(gr.model_id, 'Unknown model') as model_id,
      gr.provider as provider,
      sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
    from private.v2_rpc_gateway_requests_compat gr
    where gr.app_id = p_app_id
      and gr.success = true
      and gr.created_at >= now() - (p_recent_days::text || ' days')::interval
    group by 1, 2
  ),
  previous as (
    select
      coalesce(gr.model_id, 'Unknown model') as model_id,
      gr.provider as provider,
      sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
    from private.v2_rpc_gateway_requests_compat gr
    where gr.app_id = p_app_id
      and gr.success = true
      and gr.created_at >= now() - ((p_recent_days + p_previous_days)::text || ' days')::interval
      and gr.created_at < now() - (p_recent_days::text || ' days')::interval
    group by 1, 2
  ),
  combined as (
    select
      r.model_id,
      r.provider,
      r.tokens as recent_tokens,
      coalesce(p.tokens, 0)::bigint as previous_tokens,
      (r.tokens - coalesce(p.tokens, 0))::bigint as delta_tokens
    from recent r
    left join previous p
      on p.model_id = r.model_id
      and (
        (p.provider is null and r.provider is null)
        or p.provider = r.provider
      )
  )
  select
    model_id,
    provider,
    recent_tokens,
    previous_tokens,
    delta_tokens
  from combined
  order by delta_tokens desc
  limit 1;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_app_rising_model"(uuid, integer, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_app_rising_model"(uuid, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_app_rising_model"(uuid, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_app_rising_model"(uuid, integer, integer) TO "postgres";
