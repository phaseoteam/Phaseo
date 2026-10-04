CREATE OR REPLACE FUNCTION public.get_public_top_apps (
  p_limit      integer DEFAULT 20,
  p_time_range text    DEFAULT 'week'::text
)
  RETURNS TABLE (
    app_id        text,
    app_name      text,
    requests      bigint,
    tokens        bigint,
    unique_models integer
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_since date;
begin
  case p_time_range
    when 'today' then v_since := v_today;
    when 'week' then v_since := v_today - 7;
    when '4w' then v_since := v_today - 28;
    when 'month' then v_since := v_today - 30;
    else v_since := v_today - 7;
  end case;

  return query
  with eligible_usage as (
    select
      public.api_app_url_group_key(aa.url, aa.id::text) as url_group,
      aa.id::text as member_id,
      aa.title as member_name,
      aa.last_seen,
      d.model_id,
      d.requests,
      d.tokens
    from public.v2_rpc_public_app_model_usage_daily d
    join public.api_apps aa on aa.id::text = d.app_id
    where d.day_bucket >= v_since
      and aa.is_public = true
      and aa.is_active = true
  ),
  member_totals as (
    select
      url_group,
      member_id,
      member_name,
      last_seen,
      sum(eligible_usage.requests)::bigint as member_requests,
      sum(eligible_usage.tokens)::bigint as member_tokens
    from eligible_usage
    group by
      eligible_usage.url_group,
      eligible_usage.member_id,
      eligible_usage.member_name,
      eligible_usage.last_seen
  ),
  representatives as (
    select distinct on (url_group)
      url_group,
      member_id,
      member_name
    from member_totals
    order by
      url_group,
      member_tokens desc,
      member_requests desc,
      last_seen desc nulls last,
      member_id
  ),
  group_totals as (
    select
      url_group,
      sum(eligible_usage.requests)::bigint as request_count,
      sum(eligible_usage.tokens)::bigint as token_count,
      count(distinct eligible_usage.model_id)::integer as model_count
    from eligible_usage
    group by eligible_usage.url_group
  )
  select
    representatives.member_id,
    representatives.member_name,
    group_totals.request_count,
    group_totals.token_count,
    group_totals.model_count
  from group_totals
  join representatives using (url_group)
  order by group_totals.token_count desc, group_totals.request_count desc
  limit greatest(p_limit, 1);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_top_apps"(integer, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_top_apps"(integer, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_public_top_apps"(integer, text) IS 'Ranks active public apps by combined usage for each normalized public app URL.';

REVOKE ALL ON FUNCTION "public"."get_public_top_apps"(integer, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_top_apps"(integer, text) TO "postgres";
