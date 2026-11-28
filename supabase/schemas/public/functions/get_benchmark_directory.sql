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
