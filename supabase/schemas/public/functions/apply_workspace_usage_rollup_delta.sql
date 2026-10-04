CREATE OR REPLACE FUNCTION public.apply_workspace_usage_rollup_delta (
  p_bucket_15m         timestamp with time zone,
  p_workspace_id       uuid,
  p_key_id             uuid,
  p_provider           text,
  p_canonical_model_id text,
  p_requests           bigint,
  p_success_requests   bigint,
  p_total_tokens       bigint,
  p_total_cost_nanos   bigint,
  p_latency_sum_ms     numeric,
  p_latency_samples    bigint,
  p_throughput_sum     numeric,
  p_throughput_samples bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  -- Rollup writes disabled intentionally.
  return;
end;
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."apply_workspace_usage_rollup_delta"(timestamp WITH time zone, uuid, uuid, text, text, bigint, bigint, bigint, bigint, numeric, bigint, numeric, bigint)
  TO "service_role";

REVOKE ALL
  ON FUNCTION "public"."apply_workspace_usage_rollup_delta"(timestamp WITH time zone, uuid, uuid, text, text, bigint, bigint, bigint, bigint, numeric, bigint, numeric, bigint)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."apply_workspace_usage_rollup_delta"(timestamp WITH time zone, uuid, uuid, text, text, bigint, bigint, bigint, bigint, numeric, bigint, numeric, bigint)
  TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."apply_workspace_usage_rollup_delta"(timestamp WITH time zone, uuid, uuid, text, text, bigint, bigint, bigint, bigint, numeric, bigint, numeric, bigint)
  FROM PUBLIC, "anon", "authenticated";
