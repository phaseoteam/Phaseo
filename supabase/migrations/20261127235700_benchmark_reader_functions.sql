-- Read functions for the benchmark pages: the benchmarks index aggregates counts and freshness per
-- benchmark in the database, and model pages read one model's results with its rank on each benchmark.

SET local check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.get_benchmark_directory ()
  RETURNS TABLE (
    benchmark_id           text,
    name                   text,
    category               text,
    unit                   text,
    benchmark_type         text,
    higher_is_better       boolean,
    source_id              text,
    source_name            text,
    source_publisher       text,
    source_last_success_at timestamp with time zone,
    model_count            bigint,
    result_count           bigint,
    independent_count      bigint,
    latest_observed_on     date,
    latest_updated_at      timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- One row per benchmark with public results: counts and freshness are aggregated here so the
  -- benchmarks index never loads individual results.
  with visible_models as (
    select m.model_slug
    from public.v2_models m
    where m.hidden = false
      and m.status not in ('disabled', 'not_ready', 'coming_soon', 'testing', 'draft', 'pending')
      and (m.released_at is null or m.released_at <= now())
      and not exists (select 1 from public.v2_model_provider_routes r where r.model_slug = m.model_slug and r.is_stealth)
  ),
  aggregated as (
    select
      result.benchmark_id,
      count(distinct result.model_slug) as model_count,
      count(*) as result_count,
      count(*) filter (where not result.is_self_reported) as independent_count,
      max(result.observed_on) as latest_observed_on,
      max(coalesce(result.updated_at, result.created_at)) as latest_updated_at,
      mode() within group (order by result.source_id) filter (where result.source_id is not null) as result_source_id
    from public.v2_benchmark_results result
    join visible_models visible on visible.model_slug = result.model_slug
    where result.effective_to is null or result.effective_to > now()
    group by result.benchmark_id
  )
  select
    benchmark.benchmark_id,
    benchmark.name,
    benchmark.category,
    benchmark.unit,
    benchmark.benchmark_type,
    benchmark.ascending_order is not false as higher_is_better,
    source.source_id,
    source.name as source_name,
    source.publisher as source_publisher,
    source.last_success_at as source_last_success_at,
    aggregated.model_count,
    aggregated.result_count,
    aggregated.independent_count,
    aggregated.latest_observed_on,
    aggregated.latest_updated_at
  from aggregated
  join public.v2_benchmarks benchmark on benchmark.benchmark_id = aggregated.benchmark_id
  left join public.v2_benchmark_sources source
    on source.source_id = coalesce(benchmark.source_id, aggregated.result_source_id)
  order by aggregated.model_count desc, benchmark.name;
$function$;

COMMENT ON FUNCTION "public"."get_benchmark_directory"() IS 'Benchmarks with public results, with model counts, freshness and source, aggregated for the benchmarks index.';

REVOKE ALL ON FUNCTION "public"."get_benchmark_directory"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_benchmark_directory"() TO "anon", "authenticated", "service_role";

REVOKE ALL ON FUNCTION "public"."get_benchmark_directory"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_benchmark_directory"() TO "postgres";

CREATE OR REPLACE FUNCTION public.get_model_benchmark_profile (
  p_model_slug text
)
  RETURNS TABLE (
    result_id          uuid,
    benchmark_id       text,
    score              text,
    comparable_score   numeric,
    is_self_reported   boolean,
    source_id          text,
    effort             text,
    harness            text,
    config             text,
    variant            text,
    other_info         text,
    source_link        text,
    ci_low             numeric,
    ci_high            numeric,
    cost_usd           numeric,
    duration_seconds   numeric,
    output_tokens      numeric,
    observed_on        date,
    updated_at         timestamp with time zone,
    benchmark_name     text,
    category           text,
    unit               text,
    benchmark_type     text,
    higher_is_better   boolean,
    source_name        text,
    source_publisher   text,
    source_attribution text,
    source_url         text,
    model_rank         bigint,
    ranked_models      bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Every active result for one public model, with its rank on each benchmark among public models.
  -- A model that isn't public (hidden, unreleased, a draft-like status or served through a stealth
  -- route) returns nothing, the same rule as catalog_model_is_public: the API reads this with the
  -- service role, so row security doesn't apply.
  -- A model's standing on a benchmark is its best independent result, or its best self-reported
  -- result when no independent one exists. The score is score_numeric, else the number in the score
  -- text ('76%' is 76). Scraped results (source_id set) are already in points; only hand-entered
  -- percentage rows written without a percent sign may be stored as fractions (0.76 is 76).
  with visible_models as (
    select m.model_slug
    from public.v2_models m
    where m.hidden = false
      and m.status not in ('disabled', 'not_ready', 'coming_soon', 'testing', 'draft', 'pending')
      and (m.released_at is null or m.released_at <= now())
      and not exists (select 1 from public.v2_model_provider_routes r where r.model_slug = m.model_slug and r.is_stealth)
  ),
  model_results as (
    select result.*
    from public.v2_benchmark_results result
    join visible_models visible on visible.model_slug = result.model_slug
    where result.model_slug = lower(btrim(p_model_slug))
      and (result.effective_to is null or result.effective_to > now())
  ),
  parsed as (
    select
      result.result_id,
      result.benchmark_id,
      result.model_slug,
      not result.is_self_reported as independent,
      benchmark.ascending_order is false as lower_is_better,
      result.source_id is null and benchmark.benchmark_type = 'percentage'
        and position('%' in coalesce(result.score, '')) = 0 as may_be_fraction,
      coalesce(
        result.score_numeric,
        substring(replace(result.score, ',', '') from '[-+]?[0-9]*[.]?[0-9]+(?:[eE][-+]?[0-9]+)?')::numeric
      ) as value
    from public.v2_benchmark_results result
    join public.v2_benchmarks benchmark on benchmark.benchmark_id = result.benchmark_id
    join visible_models visible on visible.model_slug = result.model_slug
    where result.benchmark_id in (select distinct benchmark_id from model_results)
      and (result.effective_to is null or result.effective_to > now())
  ),
  scored as (
    select
      parsed.result_id,
      parsed.benchmark_id,
      parsed.model_slug,
      parsed.independent,
      parsed.lower_is_better,
      case
        when parsed.may_be_fraction and abs(parsed.value) > 0 and abs(parsed.value) <= 1 then parsed.value * 100
        else parsed.value
      end as comparable_score
    from parsed
    where parsed.value is not null
  ),
  standings as (
    select
      scored.benchmark_id,
      scored.model_slug,
      bool_or(scored.lower_is_better) as lower_is_better,
      case
        when bool_or(scored.independent) then
          case when bool_or(scored.lower_is_better)
            then min(scored.comparable_score) filter (where scored.independent)
            else max(scored.comparable_score) filter (where scored.independent) end
        else
          case when bool_or(scored.lower_is_better)
            then min(scored.comparable_score)
            else max(scored.comparable_score) end
      end as primary_score
    from scored
    group by scored.benchmark_id, scored.model_slug
  ),
  ranked as (
    select
      standings.benchmark_id,
      standings.model_slug,
      rank() over (
        partition by standings.benchmark_id
        order by
          case when standings.lower_is_better then standings.primary_score end asc nulls last,
          case when not standings.lower_is_better then standings.primary_score end desc nulls last
      ) as model_rank,
      count(*) over (partition by standings.benchmark_id) as ranked_models
    from standings
  )
  select
    result.result_id,
    result.benchmark_id,
    result.score,
    scored.comparable_score,
    result.is_self_reported,
    result.source_id,
    result.effort,
    result.harness,
    result.config,
    result.variant,
    result.other_info,
    result.source_link,
    result.ci_low,
    result.ci_high,
    result.cost_usd,
    result.duration_seconds,
    result.output_tokens::numeric,
    result.observed_on,
    coalesce(result.updated_at, result.created_at) as updated_at,
    benchmark.name as benchmark_name,
    benchmark.category,
    benchmark.unit,
    benchmark.benchmark_type,
    benchmark.ascending_order is not false as higher_is_better,
    source.name as source_name,
    source.publisher as source_publisher,
    source.attribution as source_attribution,
    source.url as source_url,
    ranked.model_rank,
    ranked.ranked_models
  from model_results result
  join public.v2_benchmarks benchmark on benchmark.benchmark_id = result.benchmark_id
  left join scored on scored.result_id = result.result_id
  left join public.v2_benchmark_sources source on source.source_id = coalesce(result.source_id, benchmark.source_id)
  left join ranked on ranked.benchmark_id = result.benchmark_id and ranked.model_slug = result.model_slug
  order by benchmark.name, result.benchmark_id, result.result_id;
$function$;

COMMENT ON FUNCTION "public"."get_model_benchmark_profile"(text) IS 'Every active benchmark result for one public model (nothing for a model that is not public), with benchmark and source metadata and the model''s rank among public models on each benchmark.';

REVOKE ALL ON FUNCTION "public"."get_model_benchmark_profile"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_model_benchmark_profile"(text) TO "anon", "authenticated", "service_role";

REVOKE ALL ON FUNCTION "public"."get_model_benchmark_profile"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_model_benchmark_profile"(text) TO "postgres";
