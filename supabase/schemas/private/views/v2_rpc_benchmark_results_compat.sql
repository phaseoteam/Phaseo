CREATE VIEW "private"."v2_rpc_benchmark_results_compat" WITH (security_invoker=true) AS  SELECT result_id,
    model_slug,
    benchmark_id,
    score,
    score_numeric,
    is_self_reported,
    other_info,
    source_link,
    rank,
    occur_idx,
    variant,
    result_key,
    created_at,
    updated_at,
    result_id AS id,
    model_slug AS model_id
   FROM public.v2_benchmark_results result;

GRANT SELECT ON TABLE "private"."v2_rpc_benchmark_results_compat" TO "service_role";
