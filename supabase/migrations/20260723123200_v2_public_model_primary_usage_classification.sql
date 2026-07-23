-- Keep character counts from becoming the public primary metric for ordinary
-- text models. They are useful for character-priced audio workflows, while a
-- request count is the honest fallback when a text provider omits token usage.

alter function public.get_v2_public_model_weekly_metrics()
  rename to get_v2_public_model_weekly_metrics_base;

create or replace function public.get_v2_public_model_weekly_metrics()
returns table (
  model_slug text,
  popularity_tokens_week numeric,
  weekly_usage_metric text,
  weekly_usage_quantity numeric,
  weekly_usage_unit text,
  throughput_week numeric,
  latency_week numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with request_totals as (
    select
      rollup.model_slug,
      sum(rollup.requests)::numeric as requests
    from public.v2_public_usage_daily rollup
    where rollup.usage_date >= current_date - 6
      and rollup.usage_date <= current_date
    group by rollup.model_slug
  )
  select
    metric.model_slug,
    metric.popularity_tokens_week,
    case
      when metric.weekly_usage_metric = 'characters'
        and lower(coalesce(model.metadata->>'model_type', '')) <> 'audio'
        and array_to_string(model.output_modalities, ',') !~ 'audio'
        then 'requests'
      else metric.weekly_usage_metric
    end as weekly_usage_metric,
    case
      when metric.weekly_usage_metric = 'characters'
        and lower(coalesce(model.metadata->>'model_type', '')) <> 'audio'
        and array_to_string(model.output_modalities, ',') !~ 'audio'
        then coalesce(requests.requests, 0)
      else metric.weekly_usage_quantity
    end as weekly_usage_quantity,
    case
      when metric.weekly_usage_metric = 'characters'
        and lower(coalesce(model.metadata->>'model_type', '')) <> 'audio'
        and array_to_string(model.output_modalities, ',') !~ 'audio'
        then 'requests'
      else metric.weekly_usage_unit
    end as weekly_usage_unit,
    metric.throughput_week,
    metric.latency_week
  from public.get_v2_public_model_weekly_metrics_base() metric
  join public.v2_models model on model.model_slug = metric.model_slug
  left join request_totals requests on requests.model_slug = metric.model_slug
  order by weekly_usage_quantity desc, metric.model_slug;
$$;

revoke all on function public.get_v2_public_model_weekly_metrics_base()
  from public, anon, authenticated;
grant execute on function public.get_v2_public_model_weekly_metrics_base()
  to service_role;
grant execute on function public.get_v2_public_model_weekly_metrics()
  to anon, authenticated, service_role;

comment on function public.get_v2_public_model_weekly_metrics() is
  'Returns model-appropriate seven-day primary usage plus token and sample-weighted performance metrics.';
