CREATE OR REPLACE FUNCTION public.get_public_geography_usage (
  p_from           timestamp with time zone DEFAULT (now() - '30 days'::interval),
  p_to             timestamp with time zone DEFAULT now(),
  p_min_requests   bigint                   DEFAULT 1,
  p_min_workspaces bigint                   DEFAULT 1
)
  RETURNS TABLE (
    country_code    text,
    requests        bigint,
    tokens          numeric,
    share_percent   numeric,
    workspace_count bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with scoped_facts as (
    select request_event_id, workspace_id, edge_country
    from public.reporting_request_facts
    where occurred_at >= p_from
      and occurred_at < p_to
      and edge_country is not null
  ),
  request_tokens as (
    select
      fact.request_event_id,
      fact.workspace_id,
      fact.edge_country,
      coalesce(
        nullif(sum(usage.quantity) filter (
          where usage.meter_key in ('input_tokens', 'output_tokens')
        ), 0),
        sum(usage.quantity) filter (
          where usage.meter_key in (
            'input_text_tokens', 'output_text_tokens',
            'input_image_tokens', 'output_image_tokens',
            'input_audio_tokens', 'output_audio_tokens',
            'input_video_tokens', 'output_video_tokens'
          )
        ),
        0
      ) as tokens
    from scoped_facts fact
    left join public.v2_request_usage usage
      on usage.request_event_id = fact.request_event_id
     and usage.meter_key in (
       'input_tokens', 'output_tokens',
       'input_text_tokens', 'output_text_tokens',
       'input_image_tokens', 'output_image_tokens',
       'input_audio_tokens', 'output_audio_tokens',
       'input_video_tokens', 'output_video_tokens'
     )
    group by fact.request_event_id, fact.workspace_id, fact.edge_country
  ),
  countries as (
    select
      tokens.edge_country as country_code,
      count(*)::bigint as requests,
      coalesce(sum(tokens.tokens), 0) as tokens,
      count(distinct tokens.workspace_id)::bigint as workspace_count
    from request_tokens tokens
    group by tokens.edge_country
  )
  select
    country.country_code,
    country.requests,
    country.tokens,
    case
      when sum(country.requests) over () > 0
        then round(country.requests::numeric / sum(country.requests) over () * 100, 2)
      else 0
    end as share_percent,
    country.workspace_count
  from countries country
  where country.requests >= greatest(coalesce(p_min_requests, 1), 1)
    and country.workspace_count >= greatest(coalesce(p_min_workspaces, 1), 1)
  order by country.requests desc, country.country_code;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_geography_usage"(timestamp WITH time zone, timestamp WITH time zone, bigint, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_geography_usage"(timestamp WITH time zone, timestamp WITH time zone, bigint, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_geography_usage"(timestamp WITH time zone, timestamp WITH time zone, bigint, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_geography_usage"(timestamp WITH time zone, timestamp WITH time zone, bigint, bigint) FROM PUBLIC, "anon", "authenticated";
