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
  -- Every active result for one model, with the model's rank on each benchmark among public models.
  -- A model's standing on a benchmark is its best independent result, or its best self-reported
  -- result when no independent one exists. Scraped results (source_id set) are already in points;
  -- only hand-entered percentage rows may be stored as fractions.
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
    where result.model_slug = lower(btrim(p_model_slug))
      and (result.effective_to is null or result.effective_to > now())
  ),
  scored as (
    select
      result.benchmark_id,
      result.model_slug,
      not result.is_self_reported as independent,
      benchmark.ascending_order is false as lower_is_better,
      case
        when result.source_id is null and benchmark.benchmark_type = 'percentage'
          and abs(result.score_numeric) > 0 and abs(result.score_numeric) <= 1
          then result.score_numeric * 100
        else result.score_numeric
      end as comparable_score
    from public.v2_benchmark_results result
    join public.v2_benchmarks benchmark on benchmark.benchmark_id = result.benchmark_id
    where result.benchmark_id in (select distinct benchmark_id from model_results)
      and (result.effective_to is null or result.effective_to > now())
      and (result.model_slug = lower(btrim(p_model_slug)) or result.model_slug in (select model_slug from visible_models))
      and result.score_numeric is not null
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
    case
      when result.source_id is null and benchmark.benchmark_type = 'percentage'
        and abs(result.score_numeric) > 0 and abs(result.score_numeric) <= 1
        then result.score_numeric * 100
      else result.score_numeric
    end as comparable_score,
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
  left join public.v2_benchmark_sources source on source.source_id = coalesce(result.source_id, benchmark.source_id)
  left join ranked on ranked.benchmark_id = result.benchmark_id and ranked.model_slug = result.model_slug
  order by benchmark.name, result.benchmark_id, result.result_id;
$function$;

COMMENT ON FUNCTION "public"."get_model_benchmark_profile"(text) IS 'Every active benchmark result for one model, with benchmark and source metadata and the model''s rank among public models on each benchmark.';

REVOKE ALL ON FUNCTION "public"."get_model_benchmark_profile"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_model_benchmark_profile"(text) TO "anon", "authenticated", "service_role";

REVOKE ALL ON FUNCTION "public"."get_model_benchmark_profile"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_model_benchmark_profile"(text) TO "postgres";
