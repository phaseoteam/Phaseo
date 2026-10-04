CREATE OR REPLACE FUNCTION public.get_public_modality_usage_timeseries (
  p_metric     text,
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
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_since date;
begin
  case p_time_range
    when '24h' then v_since := (now() at time zone 'utc')::date - 1;
    when 'today' then v_since := (now() at time zone 'utc')::date;
    when 'week' then v_since := (now() at time zone 'utc')::date - 7;
    when 'month' then v_since := (now() at time zone 'utc')::date - 30;
    when 'year' then v_since := (now() at time zone 'utc')::date - 365;
    else v_since := (now() at time zone 'utc')::date - 365;
  end case;

  return query
  with daily as (
    select
      (date_trunc('week', d.day_bucket::timestamp) at time zone 'UTC') as time_bucket,
      d.model_id,
      sum(d.requests)::bigint as req_count,
      sum(
        case p_metric
          when 'text_tokens' then d.input_text_tokens + d.output_text_tokens
          when 'image_inputs' then d.image_inputs
          when 'image_outputs' then d.image_outputs
          when 'audio_tokens' then d.input_audio_tokens + d.output_audio_tokens
          when 'audio_seconds' then d.audio_seconds
          when 'speech_seconds' then d.speech_seconds
          when 'transcription_seconds' then d.transcription_seconds
          when 'video_tokens' then d.input_video_tokens + d.output_video_tokens
          when 'video_seconds' then d.video_seconds
          when 'cached_tokens' then d.cached_read_tokens + d.cached_write_tokens
          when 'embedding_tokens' then d.embedding_tokens
          when 'rerank_quad_tokens' then d.rerank_quad_tokens
          else 0
        end
      )::numeric as metric_value
    from public.v2_rpc_gateway_model_usage_daily d
    where d.day_bucket >= v_since
    group by 1, 2
  ),
  ranked_daily as (
    select
      d.*,
      row_number() over (
        partition by d.time_bucket
        order by d.metric_value desc, d.req_count desc, d.model_id
      ) as bucket_rank
    from daily d
    where lower(d.model_id) not in ('unknown', 'other')
      and d.metric_value > 0
  ),
  bucketed as (
    select
      d.time_bucket,
      case
        when rd.bucket_rank <= greatest(1, least(coalesce(p_top_n, 20), 100)) then d.model_id
        else 'Other'
      end as model_group,
      sum(d.req_count)::bigint as req_count,
      sum(d.metric_value)::numeric as metric_value
    from daily d
    left join ranked_daily rd
      on rd.time_bucket = d.time_bucket
      and rd.model_id = d.model_id
    where d.metric_value > 0
      and lower(d.model_id) <> 'unknown'
    group by d.time_bucket, model_group
  )
  select
    b.time_bucket as bucket,
    b.model_group as model_id,
    b.req_count as requests,
    b.metric_value as tokens,
    case
      when b.model_group = 'Other' then null
      else org.colour
    end as colour
  from bucketed b
  left join public.v2_models dm on dm.model_slug = b.model_group
  left join public.v2_labs org on dm.lab_slug = org.lab_slug
  order by b.time_bucket, b.metric_value desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_modality_usage_timeseries"(text, text, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_modality_usage_timeseries"(text, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_modality_usage_timeseries"(text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_modality_usage_timeseries"(text, text, integer) TO "postgres";
