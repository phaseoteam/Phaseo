CREATE OR REPLACE FUNCTION public.ensure_gateway_requests_partitions (
  months_ahead integer DEFAULT 1
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_cur_month timestamptz;
  v_last_month timestamptz;
  v_partition_name text;
  v_parent_name text;
BEGIN
  IF months_ahead IS NULL OR months_ahead < 0 THEN
    RAISE EXCEPTION 'months_ahead must be >= 0';
  END IF;
  v_cur_month := date_trunc('month', now());
  v_last_month := v_cur_month + make_interval(months => months_ahead);
  WHILE v_cur_month <= v_last_month LOOP
    FOREACH v_parent_name IN ARRAY ARRAY['gateway_requests', 'gateway_upstream_requests'] LOOP
      v_partition_name := format('%s_%s', v_parent_name, to_char(v_cur_month, 'YYYY_MM'));
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
        v_partition_name, v_parent_name, v_cur_month, v_cur_month + interval '1 month'
      );
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition_name);
      IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy
        WHERE polrelid = to_regclass(format('public.%I', v_partition_name))
          AND polname = 'deny_direct_client_access'
      ) THEN
        EXECUTE format(
          'CREATE POLICY deny_direct_client_access ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
          v_partition_name
        );
      END IF;
    END LOOP;
    v_cur_month := v_cur_month + interval '1 month';
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."ensure_gateway_requests_partitions"(integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."ensure_gateway_requests_partitions"(integer) TO "service_role";

COMMENT ON FUNCTION "public"."ensure_gateway_requests_partitions"(integer) IS 'Maintains physical legacy operational partitions while V2 dual-write remains enabled; not an analytical read path.';

REVOKE ALL ON FUNCTION "public"."ensure_gateway_requests_partitions"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."ensure_gateway_requests_partitions"(integer) TO "postgres";
