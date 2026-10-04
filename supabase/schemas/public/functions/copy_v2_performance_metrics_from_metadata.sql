CREATE OR REPLACE FUNCTION public.copy_v2_performance_metrics_from_metadata()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  performance jsonb := coalesce(new.safe_metadata->'performance', '{}'::jsonb);
begin
  if performance ? 'provider_ttft_ms' then
    new.provider_ttft_ms := nullif(greatest(0, round(nullif(performance->>'provider_ttft_ms', '')::numeric)), 0)::integer;
  end if;
  if performance ? 'gateway_ttft_ms' then
    new.gateway_ttft_ms := nullif(greatest(0, round(nullif(performance->>'gateway_ttft_ms', '')::numeric)), 0)::integer;
  end if;
  if performance ? 'output_speed_tps' then
    new.output_speed_tps := nullif(greatest(0, nullif(performance->>'output_speed_tps', '')::numeric), 0);
  end if;
  if performance ? 'tpot_ms' then
    new.tpot_ms := nullif(greatest(0, nullif(performance->>'tpot_ms', '')::numeric), 0);
  end if;
  if performance ? 'itl_ms' then
    new.itl_ms := nullif(greatest(0, nullif(performance->>'itl_ms', '')::numeric), 0);
  end if;
  if performance ? 'phaseo_overhead_ms' then
    new.phaseo_overhead_ms := greatest(0, round(nullif(performance->>'phaseo_overhead_ms', '')::numeric))::integer;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."copy_v2_performance_metrics_from_metadata"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."copy_v2_performance_metrics_from_metadata"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."copy_v2_performance_metrics_from_metadata"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."copy_v2_performance_metrics_from_metadata"() FROM PUBLIC, "anon", "authenticated";
