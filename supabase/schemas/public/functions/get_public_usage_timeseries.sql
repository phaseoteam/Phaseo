CREATE OR REPLACE FUNCTION public.get_public_usage_timeseries (
  p_time_range  text    DEFAULT 'week'::text,
  p_bucket_size text    DEFAULT 'hour'::text,
  p_top_n       integer DEFAULT 10
)
  RETURNS TABLE (
    bucket   timestamp with time zone,
    model_id text,
    requests bigint,
    tokens   bigint,
    colour   text
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
#variable_conflict use_column
declare
  v_since date;
begin
  case p_time_range
    when '24h' then v_since := (now() at time zone 'utc')::date - 1;
    when 'today' then v_since := (now() at time zone 'utc')::date;
    when 'week' then v_since := (now() at time zone 'utc')::date - 7;
    when 'month' then v_since := (now() at time zone 'utc')::date - 30;
    when 'year' then v_since := (now() at time zone 'utc')::date - 365;
    else v_since := (now() at time zone 'utc')::date - 7;
  end case;
  return query
  with base as (
    select
      case
        when p_bucket_size = 'month' then date_trunc('month', d.day_bucket::timestamp)::timestamptz
        when p_bucket_size = 'week' then date_trunc('week', d.day_bucket::timestamp)::timestamptz
        else d.day_bucket::timestamptz
      end as time_bucket,
      d.model_id,
      sum(d.requests)::bigint as req_count,
      sum(d.total_tokens)::bigint as tok_count
    from public.v2_rpc_gateway_model_usage_daily d
    where d.day_bucket >= v_since
    group by 1, 2
  ),
  ranked_base as (
    select
      b.*,
      row_number() over (
        partition by b.time_bucket
        order by b.tok_count desc, b.req_count desc, b.model_id
      ) as bucket_rank
    from base b
    where lower(b.model_id) not in ('unknown', 'other')
      and b.tok_count > 0
  ),
  bucketed as (
    select
      b.time_bucket,
      case
        when rb.bucket_rank <= greatest(p_top_n, 1) then b.model_id
        else 'Other'
      end as model_group,
      sum(b.req_count)::bigint as req_count,
      sum(b.tok_count)::bigint as tok_count
    from base b
    left join ranked_base rb
      on rb.time_bucket = b.time_bucket
      and rb.model_id = b.model_id
    where lower(b.model_id) <> 'unknown'
      and b.tok_count > 0
    group by b.time_bucket, model_group
  )
  select
    b.time_bucket as bucket,
    b.model_group as model_id,
    b.req_count as requests,
    b.tok_count as tokens,
    case
      when b.model_group = 'Other' then null
      else org.colour
    end as colour
  from bucketed b
  left join private.v2_rpc_models_compat dm on dm.model_id = b.model_group
  left join private.v2_rpc_labs_compat org on dm.organisation_id = org.organisation_id
  where b.tok_count > 0
  order by b.time_bucket, b.tok_count desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_usage_timeseries"(text, text, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_usage_timeseries"(text, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_usage_timeseries"(text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_usage_timeseries"(text, text, integer) TO "postgres";
