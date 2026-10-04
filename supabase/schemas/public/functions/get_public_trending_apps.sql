CREATE OR REPLACE FUNCTION public.get_public_trending_apps (
  p_limit           integer DEFAULT 20,
  p_min_week_tokens bigint  DEFAULT 0
)
  RETURNS TABLE (
    app_id               text,
    app_name             text,
    current_week_tokens  bigint,
    previous_week_tokens bigint,
    growth_tokens        bigint,
    growth_pct           numeric
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  return query
  with eligible_usage as (
    select
      public.api_app_url_group_key(aa.url, aa.id::text) as url_group,
      aa.id::text as member_id,
      aa.title as member_name,
      aa.last_seen,
      d.day_bucket,
      d.tokens
    from public.v2_rpc_public_app_model_usage_daily d
    join public.api_apps aa on aa.id::text = d.app_id
    where d.day_bucket >= v_today - 14
      and aa.is_public = true
      and aa.is_active = true
  ),
  member_totals as (
    select
      url_group,
      member_id,
      member_name,
      last_seen,
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
      last_seen desc nulls last,
      member_id
  ),
  weekly as (
    select
      url_group,
      sum(eligible_usage.tokens) filter (
        where eligible_usage.day_bucket >= v_today - 7
      )::bigint as week_0_tokens,
      sum(eligible_usage.tokens) filter (
        where eligible_usage.day_bucket >= v_today - 14
          and eligible_usage.day_bucket < v_today - 7
      )::bigint as week_1_tokens
    from eligible_usage
    group by eligible_usage.url_group
  )
  select
    representatives.member_id,
    representatives.member_name,
    coalesce(weekly.week_0_tokens, 0)::bigint,
    coalesce(weekly.week_1_tokens, 0)::bigint,
    (coalesce(weekly.week_0_tokens, 0) - coalesce(weekly.week_1_tokens, 0))::bigint,
    case
      when coalesce(weekly.week_1_tokens, 0) > 0 then
        round(
          (
            (coalesce(weekly.week_0_tokens, 0) - coalesce(weekly.week_1_tokens, 0))::numeric
            / weekly.week_1_tokens::numeric
          ) * 100,
          2
        )
      when coalesce(weekly.week_0_tokens, 0) > 0 then null
      else 0
    end
  from weekly
  join representatives using (url_group)
  where coalesce(weekly.week_0_tokens, 0) > coalesce(weekly.week_1_tokens, 0)
    and coalesce(weekly.week_0_tokens, 0) >= p_min_week_tokens
  order by
    (coalesce(weekly.week_0_tokens, 0) - coalesce(weekly.week_1_tokens, 0)) desc,
    coalesce(weekly.week_0_tokens, 0) desc
  limit greatest(p_limit, 1);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_trending_apps"(integer, bigint) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_trending_apps"(integer, bigint) TO "service_role";

COMMENT ON FUNCTION "public"."get_public_trending_apps"(integer, bigint) IS 'Ranks active public apps by combined token growth for each normalized public app URL.';

REVOKE ALL ON FUNCTION "public"."get_public_trending_apps"(integer, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_trending_apps"(integer, bigint) TO "postgres";
