-- greatest(0, NULL) is 0 in Postgres, so a request whose overhead was never
-- measured (every failure and most non-stream rows) was stored as 0 ms and
-- pulled the published overhead percentiles towards zero. Keep it NULL.
-- Existing rows are left unchanged; correcting them is a separate data step.

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
    -- Zero is a real overhead reading; only a missing value becomes NULL.
    new.phaseo_overhead_ms := case
      when nullif(performance->>'phaseo_overhead_ms', '') is null then null
      else greatest(0, round((performance->>'phaseo_overhead_ms')::numeric))::integer
    end;
  end if;
  return new;
end;
$function$;
