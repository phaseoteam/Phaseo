CREATE VIEW "private"."v2_rpc_benchmarks_compat" WITH (security_invoker=true) AS  SELECT benchmark_id,
    name,
    category,
    link,
    total_models,
    ascending_order,
    benchmark_type,
    created_at,
    updated_at,
    benchmark_id AS id,
    benchmark_type AS type
   FROM public.v2_benchmarks benchmark;

GRANT SELECT ON TABLE "private"."v2_rpc_benchmarks_compat" TO "service_role";
