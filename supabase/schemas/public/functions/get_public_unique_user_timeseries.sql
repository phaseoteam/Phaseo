CREATE OR REPLACE FUNCTION public.get_public_unique_user_timeseries (
  p_time_range  text    DEFAULT 'year'::text,
  p_bucket_size text    DEFAULT 'week'::text,
  p_top_n       integer DEFAULT 10
)
  RETURNS TABLE (
    bucket   timestamp with time zone,
    model_id text,
    requests bigint,
    tokens   bigint,
    users    bigint,
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
    else v_since := (now() at time zone 'utc')::date - 365;
  end case;

  return query
  with actor_rows as (
    select
      case
        when p_bucket_size = 'month' then date_trunc('month', d.day_bucket::timestamp)::timestamptz
        when p_bucket_size = 'day' then d.day_bucket::timestamptz
        else date_trunc('week', d.day_bucket::timestamp)::timestamptz
      end as time_bucket,
      d.model_id,
      d.actor_hash,
      sum(d.requests)::bigint as req_count,
      sum(d.tokens)::bigint as tok_count
    from public.reporting_model_user_usage_daily d
    where d.day_bucket >= v_since
      and lower(d.model_id) not in ('unknown', 'other')
    group by 1, 2, 3
  ),
  base as (
    select
      ar.time_bucket,
      ar.model_id,
      sum(ar.req_count)::bigint as req_count,
      sum(ar.tok_count)::bigint as tok_count,
      count(distinct ar.actor_hash)::bigint as user_count
    from actor_rows ar
    group by ar.time_bucket, ar.model_id
  ),
  ranked_base as (
    select
      b.*,
      row_number() over (
        partition by b.time_bucket
        order by b.user_count desc, b.tok_count desc, b.req_count desc, b.model_id
      ) as bucket_rank
    from base b
    where b.user_count > 0
  ),
  bucketed as (
    select
      ar.time_bucket,
      case
        when rb.bucket_rank <= greatest(p_top_n, 1) then ar.model_id
        else 'Other'
      end as model_group,
      sum(ar.req_count)::bigint as req_count,
      sum(ar.tok_count)::bigint as tok_count,
      count(distinct ar.actor_hash)::bigint as user_count
    from actor_rows ar
    left join ranked_base rb
      on rb.time_bucket = ar.time_bucket
      and rb.model_id = ar.model_id
    group by ar.time_bucket, model_group
  )
  select
    b.time_bucket as bucket,
    b.model_group as model_id,
    b.req_count as requests,
    b.tok_count as tokens,
    b.user_count as users,
    case
      when b.model_group = 'Other' then null
      else org.colour
    end as colour
  from bucketed b
  left join private.v2_rpc_models_compat dm on dm.model_id = b.model_group
  left join private.v2_rpc_labs_compat org on dm.organisation_id = org.organisation_id
  where b.user_count > 0
  order by b.time_bucket, b.user_count desc, b.tok_count desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_unique_user_timeseries"(text, text, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_unique_user_timeseries"(text, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_unique_user_timeseries"(text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_unique_user_timeseries"(text, text, integer) TO "postgres";
