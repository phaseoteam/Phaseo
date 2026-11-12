CREATE OR REPLACE FUNCTION public.get_release_gaps_by_org (
  p_iso text DEFAULT NULL::text
)
  RETURNS TABLE (
    organisation_id   text,
    organisation_name text,
    country_code      text,
    releases          integer,
    median_gap_days   numeric,
    p90_gap_days      numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
with org_models as (
    select
        m.organisation_id,
        coalesce(o.name, m.organisation_id) as organisation_name,
        coalesce(o.country_code, '') as country_code,
        coalesce(m.release_date, m.announcement_date)::date as d
    from private.v2_rpc_models_compat m
    join private.v2_rpc_labs_compat o on o.organisation_id = m.organisation_id
    where coalesce(m.release_date, m.announcement_date) is not null
      and (p_iso is null or lower(o.country_code) = lower(p_iso))
    group by m.organisation_id, organisation_name, country_code, d
),
ordered as (
    select
        organisation_id,
        organisation_name,
        country_code,
        d,
        lead(d) over(partition by organisation_id order by d) as next_d
    from org_models
),
gaps as (
    select
        organisation_id,
        organisation_name,
        country_code,
        (next_d - d)::numeric as gap_days
    from ordered
    where next_d is not null
      and next_d > d -- ignore zero/negative gaps
      and (next_d - d) >= 1 -- ignore sub-day gaps
)
select
    organisation_id,
    organisation_name,
    country_code,
    (select count(*) from org_models om where om.organisation_id = gaps.organisation_id)::int as releases,
    percentile_cont(0.5) within group (order by gap_days) as median_gap_days,
    percentile_cont(0.9) within group (order by gap_days) as p90_gap_days
from gaps
group by organisation_id, organisation_name, country_code
order by median_gap_days nulls last;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_release_gaps_by_org"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_release_gaps_by_org"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_release_gaps_by_org"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_release_gaps_by_org"(text) TO "postgres";
