-- phaseo:allow-production-history-backfill reason: Restore the exact migration already recorded as applied in production.
SET lock_timeout = '3s'; SET statement_timeout = '30s';
-- Reporting only. Admission is enforced by the owner Durable Object, not this table.
create table if not exists public.free_model_usage_daily (
    owner_id uuid not null,
    usage_date date not null,
    included_requests integer not null check (included_requests between 1 and 1500),
    overage_requests integer not null default 0 check (overage_requests = 0),
    updated_at timestamptz not null default now(),
    primary key (owner_id, usage_date)
);
alter table public.free_model_usage_daily enable row level security;
revoke all on public.free_model_usage_daily from public, anon, authenticated;
grant select, insert, update, delete on public.free_model_usage_daily to service_role;

create or replace function private.materialize_free_admission_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    admission jsonb := new.detail_metadata #> '{routing_diagnostics,freeQuota}';
    owner uuid;
    day date;
    used integer;
begin
    if admission is null or admission ->> 'admitted' is distinct from 'true' then return new; end if;
    -- Audit metadata is advisory. Invalid reporting must not break request audit.
    begin
        owner := (admission ->> 'ownerId')::uuid;
        day := (admission ->> 'utcDay')::date;
        used := (admission ->> 'used')::integer;
    exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
        return new;
    end;
    if owner is null or day is null or used is null or used not between 1 and 1500 then return new; end if;
    -- Cumulative admission sequence makes duplicate and out-of-order audit delivery
    -- idempotent and recovers earlier missing audit events on the next delivery.
    insert into public.free_model_usage_daily(owner_id, usage_date, included_requests)
    values (owner, day, used)
    on conflict (owner_id, usage_date) do update
      set included_requests = excluded.included_requests, updated_at = now()
      where public.free_model_usage_daily.included_requests < excluded.included_requests;
    return new;
end;
$$;
revoke all on function private.materialize_free_admission_usage() from public, anon, authenticated;
drop trigger if exists materialize_free_admission_usage on public.gateway_requests;
create trigger materialize_free_admission_usage
after insert on public.gateway_requests
for each row execute function private.materialize_free_admission_usage();


