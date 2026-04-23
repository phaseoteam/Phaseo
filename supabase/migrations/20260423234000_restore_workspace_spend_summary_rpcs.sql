-- Restore spend summary RPCs used by settings pricing widgets with workspace-era
-- parameter names and explicit access checks.

drop function if exists public.monthly_spend_prev_cents(uuid);
drop function if exists public.mtd_spend_cents(uuid);

create or replace function public.monthly_spend_prev_cents(
  p_workspace_id uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc'));
  v_prev_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc')) - interval '1 month';
  v_prev_month_nanos bigint := 0;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required';
  end if;

  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
  ) and not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = v_user_id
  ) then
    raise exception 'workspace_forbidden';
  end if;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_prev_month_nanos
  from public.gateway_requests gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_prev_month_start_ts
    and gr.created_at < v_current_month_start_ts;

  return v_prev_month_nanos;
end;
$$;

create or replace function public.mtd_spend_cents(
  p_workspace_id uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now_utc timestamptz := now();
  v_current_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc'));
  v_mtd_nanos bigint := 0;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required';
  end if;

  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
  ) and not exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = v_user_id
  ) then
    raise exception 'workspace_forbidden';
  end if;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_mtd_nanos
  from public.gateway_requests gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_current_month_start_ts
    and gr.created_at <= v_now_utc;

  return v_mtd_nanos;
end;
$$;

revoke all on function public.monthly_spend_prev_cents(uuid) from public;
revoke all on function public.mtd_spend_cents(uuid) from public;

grant execute on function public.monthly_spend_prev_cents(uuid) to authenticated;
grant execute on function public.mtd_spend_cents(uuid) to authenticated;
grant execute on function public.monthly_spend_prev_cents(uuid) to service_role;
grant execute on function public.mtd_spend_cents(uuid) to service_role;
