-- Serialize async webhook deliveries across provider webhooks, polling, and
-- reconciliation workers. Receivers still get at-least-once semantics and a
-- stable event id for their own deduplication.

create table if not exists public.gateway_async_webhook_deliveries (
  workspace_id uuid not null,
  kind text not null,
  internal_id text not null,
  delivery_key text not null,
  status text not null default 'claimed',
  claim_token text null,
  claimed_at timestamptz null,
  delivered_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, kind, internal_id, delivery_key),
  constraint gateway_async_webhook_delivery_status_check
    check (status in ('claimed', 'pending', 'delivered'))
);

alter table public.gateway_async_webhook_deliveries enable row level security;
revoke all on table public.gateway_async_webhook_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.gateway_async_webhook_deliveries to service_role;

create or replace function public.claim_gateway_async_webhook_delivery(
  p_workspace_id uuid,
  p_kind text,
  p_internal_id text,
  p_delivery_key text,
  p_claim_token text,
  p_stale_after_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.gateway_async_webhook_deliveries%rowtype;
begin
  if p_workspace_id is null or coalesce(trim(p_kind), '') = ''
     or coalesce(trim(p_internal_id), '') = '' or coalesce(trim(p_delivery_key), '') = ''
     or coalesce(trim(p_claim_token), '') = '' then
    raise exception 'invalid_webhook_delivery_claim';
  end if;

  insert into public.gateway_async_webhook_deliveries (
    workspace_id, kind, internal_id, delivery_key, status, claim_token, claimed_at, updated_at
  ) values (
    p_workspace_id, p_kind, p_internal_id, p_delivery_key, 'claimed', p_claim_token, now(), now()
  ) on conflict do nothing;

  select * into v_row
  from public.gateway_async_webhook_deliveries
  where workspace_id = p_workspace_id and kind = p_kind
    and internal_id = p_internal_id and delivery_key = p_delivery_key
  for update;

  if v_row.status = 'delivered' then return false; end if;
  if v_row.status = 'claimed' and v_row.claim_token <> p_claim_token
     and v_row.claimed_at > now() - make_interval(secs => greatest(30, p_stale_after_seconds)) then
    return false;
  end if;

  update public.gateway_async_webhook_deliveries
  set status = 'claimed', claim_token = p_claim_token, claimed_at = now(), updated_at = now()
  where workspace_id = p_workspace_id and kind = p_kind
    and internal_id = p_internal_id and delivery_key = p_delivery_key;
  return true;
end;
$$;

create or replace function public.complete_gateway_async_webhook_delivery(
  p_workspace_id uuid,
  p_kind text,
  p_internal_id text,
  p_delivery_key text,
  p_claim_token text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with changed as (
    update public.gateway_async_webhook_deliveries
    set status = 'delivered', claim_token = null, delivered_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and kind = p_kind
      and internal_id = p_internal_id and delivery_key = p_delivery_key
      and status = 'claimed' and claim_token = p_claim_token
    returning 1
  ) select exists(select 1 from changed);
$$;

create or replace function public.release_gateway_async_webhook_delivery_claim(
  p_workspace_id uuid,
  p_kind text,
  p_internal_id text,
  p_delivery_key text,
  p_claim_token text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  with changed as (
    update public.gateway_async_webhook_deliveries
    set status = 'pending', claim_token = null, claimed_at = null, updated_at = now()
    where workspace_id = p_workspace_id and kind = p_kind
      and internal_id = p_internal_id and delivery_key = p_delivery_key
      and status = 'claimed' and claim_token = p_claim_token
    returning 1
  ) select exists(select 1 from changed);
$$;

revoke all on function public.claim_gateway_async_webhook_delivery(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.complete_gateway_async_webhook_delivery(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.release_gateway_async_webhook_delivery_claim(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_gateway_async_webhook_delivery(uuid, text, text, text, text, integer) to service_role;
grant execute on function public.complete_gateway_async_webhook_delivery(uuid, text, text, text, text) to service_role;
grant execute on function public.release_gateway_async_webhook_delivery_claim(uuid, text, text, text, text) to service_role;
