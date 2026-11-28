CREATE OR REPLACE FUNCTION public.refresh_benchmark_total_models (
  p_benchmark_ids text[]
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  -- total_models counts distinct models with an active result: hand-entered and from every source.
  update public.v2_benchmarks benchmark
  set total_models = (
    select count(distinct result.model_slug)::integer
    from public.v2_benchmark_results result
    where result.benchmark_id = benchmark.benchmark_id
      and (result.effective_to is null or result.effective_to > now())
  )
  where benchmark.benchmark_id = any(p_benchmark_ids);
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_benchmark_total_models"(text[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_benchmark_total_models"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_benchmark_total_models"(text[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_benchmark_total_models"(text[]) FROM PUBLIC, "anon", "authenticated";
