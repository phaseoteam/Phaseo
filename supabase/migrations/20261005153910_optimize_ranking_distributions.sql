SET local check_function_bodies = off;
SET local lock_timeout = '5s';
SET local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.get_public_context_length_distribution (
  p_days           integer DEFAULT 30,
  p_min_requests   bigint  DEFAULT 1,
  p_min_workspaces bigint  DEFAULT 1
)
  RETURNS TABLE (
    bucket_key      text,
    bucket_label    text,
    bucket_order    integer,
    min_tokens      bigint,
    max_tokens      bigint,
    requests        bigint,
    share_percent   numeric,
    workspace_count bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with scoped_requests as (
    select fact.request_event_id, fact.workspace_id
    from public.v2_request_facts fact
    where fact.occurred_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
  ),
  per_request as (
    select
      request.request_event_id,
      request.workspace_id,
      coalesce(sum(usage.quantity) filter (
        where usage.meter_key in ('input_tokens', 'input_text_tokens', 'prompt_tokens')
      ), 0)::bigint as input_tokens
    from scoped_requests request
    left join public.v2_request_usage usage
      on usage.request_event_id = request.request_event_id
     and usage.meter_key in ('input_tokens', 'input_text_tokens', 'prompt_tokens')
    group by request.request_event_id, request.workspace_id
  ),
  eligible as (
    select * from per_request where input_tokens > 0
  ),
  totals as (
    select count(*)::bigint as requests, count(distinct workspace_id)::bigint as workspaces
    from eligible
  ),
  bucketed as (
    select
      workspace_id,
      case
        when input_tokens < 4096 then 'under_4k'
        when input_tokens < 16384 then '4k_16k'
        when input_tokens < 32768 then '16k_32k'
        when input_tokens < 65536 then '32k_64k'
        when input_tokens < 131072 then '64k_128k'
        else '128k_plus'
      end as bucket_key
    from eligible
  ),
  buckets(bucket_key, bucket_label, bucket_order, min_tokens, max_tokens) as (
    values
      ('under_4k', 'Under 4K', 1, 0::bigint, 4095::bigint),
      ('4k_16k', '4Kâ€“16K', 2, 4096::bigint, 16383::bigint),
      ('16k_32k', '16Kâ€“32K', 3, 16384::bigint, 32767::bigint),
      ('32k_64k', '32Kâ€“64K', 4, 32768::bigint, 65535::bigint),
      ('64k_128k', '64Kâ€“128K', 5, 65536::bigint, 131071::bigint),
      ('128k_plus', '128K+', 6, 131072::bigint, null::bigint)
  ),
  counts as (
    select bucket_key, count(*)::bigint as requests, count(distinct workspace_id)::bigint as workspace_count
    from bucketed
    group by bucket_key
  )
  select
    bucket.bucket_key,
    bucket.bucket_label,
    bucket.bucket_order,
    bucket.min_tokens,
    bucket.max_tokens,
    coalesce(counts.requests, 0)::bigint,
    case when total.requests > 0
      then round(coalesce(counts.requests, 0)::numeric / total.requests::numeric * 100, 2)
      else 0
    end,
    coalesce(counts.workspace_count, 0)::bigint
  from buckets bucket
  cross join totals total
  left join counts on counts.bucket_key = bucket.bucket_key
  where total.requests >= greatest(coalesce(p_min_requests, 1), 1)
    and total.workspaces >= greatest(coalesce(p_min_workspaces, 1), 1)
  order by bucket.bucket_order;
$function$;

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
    from public.v2_request_facts
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
