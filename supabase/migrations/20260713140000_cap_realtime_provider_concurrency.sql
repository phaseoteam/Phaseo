-- Protect shared upstream provider accounts from cross-workspace concurrency bursts.

begin;

create index if not exists idx_gateway_realtime_sessions_active_provider
  on public.gateway_realtime_sessions ((lower(provider)))
  where status in ('created', 'connecting', 'connected', 'ending');

create or replace function public.gateway_realtime_enforce_provider_concurrency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_provider text := lower(trim(coalesce(new.provider, '')));
  v_active_count integer;
begin
  if v_provider = '' then
    raise exception 'realtime_provider_required';
  end if;

  -- Serialize creates for one shared provider account across all workspaces.
  perform pg_advisory_xact_lock(
    hashtextextended('gateway_realtime_provider:' || v_provider, 0)
  );

  select count(*)::integer into v_active_count
  from public.gateway_realtime_sessions
  where lower(provider) = v_provider
    and status in ('created', 'connecting', 'connected', 'ending');

  if v_active_count >= 20 then
    raise exception 'realtime_provider_concurrency_limit';
  end if;

  return new;
end;
$$;

revoke all on function public.gateway_realtime_enforce_provider_concurrency()
  from public, anon, authenticated, service_role;

drop trigger if exists gateway_realtime_provider_concurrency_guard
  on public.gateway_realtime_sessions;
create trigger gateway_realtime_provider_concurrency_guard
before insert on public.gateway_realtime_sessions
for each row execute function public.gateway_realtime_enforce_provider_concurrency();

commit;

