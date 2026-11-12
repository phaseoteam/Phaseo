CREATE OR REPLACE FUNCTION public.get_v2_model_benchmarks (
  p_model_slug text
)
  RETURNS TABLE (
    result_id        uuid,
    benchmark_id     text,
    score            text,
    score_numeric    numeric,
    is_self_reported boolean,
    other_info       text,
    source_link      text,
    result_rank      integer,
    occur_idx        integer,
    variant          text,
    result_key       text,
    benchmark_name   text,
    category         text,
    link             text,
    total_models     integer,
    ascending_order  boolean,
    benchmark_type   text,
    created_at       timestamp with time zone,
    updated_at       timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select result.result_id, result.benchmark_id, result.score, result.score_numeric, result.is_self_reported,
    result.other_info, result.source_link, result.rank, result.occur_idx, result.variant, result.result_key,
    benchmark.name, benchmark.category, benchmark.link, benchmark.total_models, benchmark.ascending_order,
    benchmark.benchmark_type, result.created_at, result.updated_at
  from public.v2_benchmark_results result
  join public.v2_benchmarks benchmark on benchmark.benchmark_id = result.benchmark_id
  where result.model_slug = lower(trim(p_model_slug)) and (result.effective_to is null or result.effective_to>now())
  order by benchmark.name, result.rank nulls last, result.created_at desc;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_benchmarks"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_benchmarks"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_benchmarks"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_benchmarks"(text) TO "postgres";
