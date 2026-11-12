CREATE OR REPLACE FUNCTION public.get_monthly_release_share_all (
  p_months integer DEFAULT 12
)
  RETURNS TABLE (
    month_start     date,
    iso             text,
    releases        integer,
    global_releases integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
with base as (
    select
        date_trunc('month', coalesce(m.release_date, m.announcement_date))::date as month_start,
        coalesce(o.country_code, '') as iso
    from private.v2_rpc_models_compat m
    join private.v2_rpc_labs_compat o on o.organisation_id = m.organisation_id
    where coalesce(m.release_date, m.announcement_date) is not null
),
bounds as (
    select date_trunc('month', now())::date - (interval '1 month' * (p_months - 1)) as min_month
),
monthly as (
    select
        month_start,
        lower(iso) as iso,
        count(*)::int as releases
    from base
    where month_start >= (select min_month from bounds)
    group by month_start, iso
)
select
    m.month_start,
    m.iso,
    m.releases,
    sum(m.releases) over(partition by m.month_start) as global_releases
from monthly m
order by m.month_start, m.iso;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_monthly_release_share_all"(integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_monthly_release_share_all"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_monthly_release_share_all"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_monthly_release_share_all"(integer) TO "postgres";
