-- Count only provider-attributable failures toward endpoint uptime and expose
-- a bounded aggregate taxonomy instead of raw upstream error strings.
do $$
declare
  definition text;
  updated text;
begin
  select pg_get_functiondef('public.get_v2_model_provider_tier_health_metrics(text,integer,numeric)'::regprocedure)
    into definition;
  updated := definition;

  updated := replace(updated,
    $old$when base.success is true then 'success'
        when base.status_code = 429$old$,
    $new$when base.success is true and base.finish_reason is distinct from 'error' then 'success'
        when base.status_code in (400, 403, 413)
        then 'neutral'
        when base.status_code = 429$new$);

  updated := replace(updated,
    $old$error_codes as (
    select grouped.provider_id, grouped.service_tier,
      jsonb_object_agg(grouped.error_code, grouped.error_count order by grouped.error_count desc, grouped.error_code) as counts
    from (
      select c.provider_id, c.service_tier, c.error_code, count(*)::bigint as error_count
      from classified c
      where c.error_code <> ''
      group by c.provider_id, c.service_tier, c.error_code
    ) grouped
    group by grouped.provider_id, grouped.service_tier
  ),$old$,
    $new$error_codes as (
    select grouped.provider_id, grouped.service_tier,
      jsonb_object_agg(grouped.error_category, grouped.error_count order by grouped.error_count desc, grouped.error_category) as counts
    from (
      select c.provider_id, c.service_tier,
        case
          when c.status_code = 401 then 'authentication'
          when c.status_code = 402 then 'payment'
          when c.status_code = 404 then 'model_unavailable'
          when c.status_code >= 500 then 'server'
          when c.finish_reason = 'error'
            or c.error_code like '%stream%'
            or c.error_code like '%disconnect%'
          then 'stream'
          else 'other_provider'
        end as error_category,
        count(*)::bigint as error_count
      from classified c
      where c.health_outcome = 'failure'
      group by c.provider_id, c.service_tier, error_category
    ) grouped
    group by grouped.provider_id, grouped.service_tier
  ),$new$);

  updated := replace(updated,
    $old$'health_success_requests', bucket.health_success_requests,
        'uptime_pct'$old$,
    $new$'health_success_requests', bucket.health_success_requests,
        'failed_requests', bucket.failed_requests,
        'neutral_requests', bucket.neutral_requests,
        'rate_limited_requests', bucket.rate_limited_requests,
        'uptime_pct'$new$);

  updated := replace(updated,
    $old$count(*)::bigint as requests,
        count(*) filter (where c.success is true)::bigint as success_requests,
        count(*) filter (where c.health_outcome <> 'neutral')::bigint as health_requests,
        count(*) filter (where c.health_outcome = 'success')::bigint as health_success_requests,
        percentile_cont$old$,
    $new$count(*)::bigint as requests,
        count(*) filter (where c.success is true)::bigint as success_requests,
        count(*) filter (where c.health_outcome <> 'neutral')::bigint as health_requests,
        count(*) filter (where c.health_outcome = 'success')::bigint as health_success_requests,
        count(*) filter (where c.health_outcome = 'failure')::bigint as failed_requests,
        count(*) filter (where c.health_outcome = 'neutral')::bigint as neutral_requests,
        count(*) filter (where c.is_rate_limited)::bigint as rate_limited_requests,
        percentile_cont$new$);

  if updated = definition
    or updated not like '%base.status_code in (400, 403, 413)%'
    or updated not like '%error_category%'
    or updated not like '%''failed_requests'', bucket.failed_requests%'
  then
    raise exception 'Could not patch provider health function definition';
  end if;

  execute updated;
end
$$;

do $$
declare
  definition text;
  updated text;
begin
  select pg_get_functiondef('public.get_v2_model_provider_health_metrics_unfiltered(text,integer,numeric)'::regprocedure)
    into definition;
  updated := replace(definition,
    $old$fact.success,
      fact.status_code,$old$,
    $new$fact.success,
      nullif(lower(trim(fact.stop_reason)), '') as finish_reason,
      fact.status_code,$new$);
  updated := replace(updated,
    $old$when base.success is true then 'success'
        when base.status_code = 429$old$,
    $new$when base.success is true and base.finish_reason is distinct from 'error' then 'success'
        when base.status_code in (400, 403, 413)
        then 'neutral'
        when base.status_code = 429$new$);

  if updated = definition
    or updated not like '%base.status_code in (400, 403, 413)%'
    or updated not like '%fact.stop_reason%'
  then
    raise exception 'Could not patch legacy provider health function definition';
  end if;

  execute updated;
end
$$;
