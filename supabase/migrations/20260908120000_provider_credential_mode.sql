alter table public.v2_providers
  add column if not exists credential_mode text not null default 'managed_and_byok';

alter table public.v2_providers
  drop constraint if exists v2_providers_credential_mode_check;

alter table public.v2_providers
  add constraint v2_providers_credential_mode_check
  check (credential_mode in ('managed_and_byok', 'byok_only'));

comment on column public.v2_providers.credential_mode is
  'Whether Phaseo may use managed provider credentials or must use a workspace BYOK credential.';

alter table public.v2_model_provider_routes
  add column if not exists credential_mode text not null default 'managed_and_byok'
  check (credential_mode in ('managed_and_byok', 'byok_only'));

comment on column public.v2_model_provider_routes.credential_mode is
  'Optional route-level override requiring a workspace BYOK credential for this model offer.';

notify pgrst, 'reload schema';

-- The current provider editor writes through the provider-offer mutation.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.mutate_v2_admin_provider_offer(uuid,text,text,jsonb)'::regprocedure) into v_definition;
  v_definition := replace(v_definition,
    'insert into public.v2_providers(provider_slug,name,provider_family_slug,offer_scope,offer_label,residency_mode,default_execution_regions,default_data_regions,country_code,subdivision_code,base_url,byok_available,status,routing_enabled,routable,metadata,updated_at)',
    'insert into public.v2_providers(provider_slug,name,provider_family_slug,offer_scope,offer_label,residency_mode,default_execution_regions,default_data_regions,country_code,subdivision_code,base_url,byok_available,credential_mode,status,routing_enabled,routable,metadata,updated_at)');
  v_definition := replace(v_definition,
    'coalesce((p_payload->>''byok_available'')::boolean,(v_before->>''byok_available'')::boolean,false), lower(',
    'coalesce((p_payload->>''byok_available'')::boolean,(v_before->>''byok_available'')::boolean,false), coalesce(p_payload->>''credential_mode'',v_before->>''credential_mode'',''managed_and_byok''), lower(');
  v_definition := replace(v_definition,
    'byok_available=excluded.byok_available,status=excluded.status',
    'byok_available=excluded.byok_available,credential_mode=excluded.credential_mode,status=excluded.status');
  if position('credential_mode' in v_definition) = 0 then raise exception 'provider-offer mutation patch failed'; end if;
  execute v_definition;
end $$;

create table if not exists public.workspace_byok_monthly_usage_events (
  workspace_id uuid not null,
  month_start timestamptz not null,
  idempotency_key text not null,
  request_count bigint not null check (request_count > 0),
  created_at timestamptz not null default now(),
  primary key (workspace_id, month_start, idempotency_key)
);

alter table public.workspace_byok_monthly_usage_events enable row level security;

create or replace function public.increment_workspace_byok_monthly_request_count_once(
  p_workspace_id uuid, p_now timestamptz, p_request_count bigint, p_idempotency_key text
) returns table (month_start timestamptz, request_count bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_month_start timestamptz := (date_trunc('month', p_now at time zone 'UTC') at time zone 'UTC');
  v_inserted bigint;
begin
  if p_workspace_id is null or p_request_count < 1 or nullif(trim(p_idempotency_key),'') is null then
    raise exception 'workspace, positive request count, and idempotency key are required';
  end if;
  insert into public.workspace_byok_monthly_usage_events(workspace_id,month_start,idempotency_key,request_count)
  values(p_workspace_id,v_month_start,p_idempotency_key,p_request_count)
  on conflict do nothing returning workspace_byok_monthly_usage_events.request_count into v_inserted;
  if v_inserted is not null then
    insert into public.workspace_byok_monthly_usage as usage(workspace_id,month_start,request_count,created_at,updated_at)
    values(p_workspace_id,v_month_start,v_inserted,now(),now())
    on conflict(workspace_id,month_start) do update
      set request_count=usage.request_count+excluded.request_count,updated_at=now();
  end if;
  return query select u.month_start,u.request_count from public.workspace_byok_monthly_usage u
    where u.workspace_id=p_workspace_id and u.month_start=v_month_start;
end $$;

revoke all on function public.increment_workspace_byok_monthly_request_count_once(uuid,timestamptz,bigint,text) from public,anon,authenticated;
grant execute on function public.increment_workspace_byok_monthly_request_count_once(uuid,timestamptz,bigint,text) to service_role;

create or replace function public.increment_workspace_byok_monthly_request_count_by(
  p_workspace_id uuid,
  p_now timestamptz,
  p_request_count bigint
)
returns table (month_start timestamptz, request_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_month_start timestamptz;
begin
  if p_workspace_id is null then raise exception 'p_workspace_id is required'; end if;
  if p_request_count is null or p_request_count < 1 then raise exception 'p_request_count must be positive'; end if;
  v_month_start := (date_trunc('month', p_now at time zone 'UTC') at time zone 'UTC');
  insert into public.workspace_byok_monthly_usage as usage (
    workspace_id, month_start, request_count, created_at, updated_at
  ) values (
    p_workspace_id, v_month_start, p_request_count, now(), now()
  ) on conflict (workspace_id, month_start) do update
    set request_count = usage.request_count + excluded.request_count,
        updated_at = now();
  return query select u.month_start, u.request_count
    from public.workspace_byok_monthly_usage u
    where u.workspace_id = p_workspace_id and u.month_start = v_month_start;
end;
$$;

revoke all on function public.increment_workspace_byok_monthly_request_count_by(uuid,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.increment_workspace_byok_monthly_request_count_by(uuid,timestamptz,bigint) to service_role;
