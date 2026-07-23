create or replace function public.refresh_v2_provider_health_for_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row record;
  provider_slug_value text;
begin
  select fact.occurred_at, coalesce(fact.routed_model_slug, fact.requested_model_slug) as model_slug
    into request_row
  from public.v2_request_facts fact
  where fact.request_event_id = new.request_event_id;
  if request_row.model_slug is null or new.provider_model_id is null then return new; end if;

  select route.provider_slug into provider_slug_value
  from public.v2_model_provider_routes route
  where route.provider_model_id = new.provider_model_id;
  if provider_slug_value is null then return new; end if;

  delete from public.v2_public_provider_health_daily
  where usage_date = request_row.occurred_at::date
    and model_slug = request_row.model_slug
    and provider_model_id = new.provider_model_id;

  insert into public.v2_public_provider_health_daily (
    usage_date, model_slug, provider_model_id, provider_slug, request_count,
    successful_request_count, attempt_count, successful_attempts, failed_attempts,
    fallback_attempts, latency_sum_ms, latency_count
  )
  select request_row.occurred_at::date, request_row.model_slug, new.provider_model_id, provider_slug_value,
    count(distinct fact.request_event_id), count(distinct fact.request_event_id) filter (where attempt.success),
    count(*), count(*) filter (where attempt.success), count(*) filter (where not attempt.success),
    count(*) filter (where attempt.attempt_number > 1),
    coalesce(sum(attempt.latency_ms) filter (where attempt.latency_ms is not null), 0), count(attempt.latency_ms)
  from public.v2_request_attempts attempt
  join public.v2_request_facts fact on fact.request_event_id = attempt.request_event_id
  where fact.occurred_at::date = request_row.occurred_at::date
    and coalesce(fact.routed_model_slug, fact.requested_model_slug) = request_row.model_slug
    and attempt.provider_model_id = new.provider_model_id;
  return new;
end;
$$;

drop trigger if exists v2_request_attempts_health_refresh on public.v2_request_attempts;
create trigger v2_request_attempts_health_refresh
after insert on public.v2_request_attempts
for each row execute function public.refresh_v2_provider_health_for_attempt();

grant execute on function public.refresh_v2_provider_health_for_attempt() to service_role;
