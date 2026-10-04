CREATE OR REPLACE FUNCTION public.get_private_geography_usage (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone
)
  RETURNS TABLE (
    country_code       text,
    continent_code     text,
    requests           bigint,
    tokens             numeric,
    spend_nanos        numeric,
    successes          bigint,
    average_latency_ms numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with scoped_facts as materialized (
    select
      f.request_event_id,
      f.edge_country,
      f.edge_continent,
      f.cost_nanos,
      f.success,
      f.latency_ms
    from public.v2_request_facts f
    where f.workspace_id = p_workspace_id
      and f.occurred_at >= p_from
      and f.occurred_at < p_to
      and f.edge_country is not null
  ),
  request_tokens as (
    select
      f.request_event_id,
      coalesce(
        nullif(sum(u.quantity) filter (
          where u.meter_key in ('input_tokens', 'output_tokens')
        ), 0),
        sum(u.quantity) filter (
          where u.meter_key in (
            'input_text_tokens', 'output_text_tokens',
            'input_image_tokens', 'output_image_tokens',
            'input_audio_tokens', 'output_audio_tokens',
            'input_video_tokens', 'output_video_tokens'
          )
        ),
        0
      ) as tokens
    from scoped_facts f
    left join public.v2_request_usage u
      on u.request_event_id = f.request_event_id
    group by f.request_event_id
  )
  select
    f.edge_country,
    max(f.edge_continent),
    count(*)::bigint,
    coalesce(sum(t.tokens), 0),
    coalesce(sum(f.cost_nanos), 0)::numeric,
    count(*) filter (where f.success)::bigint,
    avg(f.latency_ms)::numeric
  from scoped_facts f
  left join request_tokens t on t.request_event_id = f.request_event_id
  group by f.edge_country
  order by count(*) desc, f.edge_country;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_private_geography_usage"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_private_geography_usage"(uuid, timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_private_geography_usage"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_private_geography_usage"(uuid, timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
