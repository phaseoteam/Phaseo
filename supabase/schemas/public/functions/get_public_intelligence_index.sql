CREATE OR REPLACE FUNCTION public.get_public_intelligence_index (
  p_limit integer DEFAULT 20
)
  RETURNS TABLE (
    benchmark_id      text,
    benchmark_name    text,
    benchmark_type    text,
    category          text,
    model_id          text,
    model_name        text,
    organisation_id   text,
    organisation_name text,
    score             numeric,
    rank              bigint,
    total_models      bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with scored as (
    select
      benchmark.benchmark_id,
      benchmark.name as benchmark_name,
      benchmark.benchmark_type,
      benchmark.category,
      model.model_slug as model_id,
      model.name as model_name,
      model.lab_slug as organisation_id,
      lab.name as organisation_name,
      result.score_numeric as score,
      row_number() over (order by result.score_numeric desc, model.name, model.model_slug) as rank,
      count(*) over () as total_models
    from public.v2_benchmark_results result
    join public.v2_benchmarks benchmark
      on benchmark.benchmark_id = result.benchmark_id
    join public.v2_models model
      on model.model_slug = result.model_slug
     and model.hidden = false
    left join public.v2_labs lab
      on lab.lab_slug = model.lab_slug
    where result.benchmark_id = 'aa-intelligence-index-v4'
      and result.score_numeric is not null
  )
  select *
  from scored
  where rank <= greatest(1, least(coalesce(p_limit, 20), 100))
  order by rank;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_intelligence_index"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_intelligence_index"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_intelligence_index"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_intelligence_index"(integer) FROM PUBLIC, "anon", "authenticated";
