-- Workspace pricing/billing schema cleanup.
-- Keeps wallet billing + flat 5% pricing, removes legacy invoice/tier state tables.

-- Drop invoice onboarding/mode triggers first (they reference columns being removed).
drop trigger if exists workspaces_invoice_mode_lock on public.workspaces;
drop trigger if exists teams_invoice_mode_lock on public.workspaces;
drop trigger if exists workspaces_invoice_onboarding_status_guard on public.workspaces;
drop trigger if exists teams_invoice_onboarding_status_guard on public.workspaces;
drop function if exists public.enforce_workspace_invoice_mode_lock();
drop function if exists public.enforce_team_invoice_mode_lock();
drop function if exists public.enforce_workspace_invoice_onboarding_status();
drop function if exists public.enforce_team_invoice_onboarding_status();
-- Re-define tier functions to no-op/flat-tier implementations before dropping
-- legacy tier bookkeeping columns.
drop function if exists public.calculate_tier_with_grace(uuid, bigint);
drop function if exists public.cleanup_dormant_enterprise_workspaces();
drop function if exists public.get_workspace_tier_info(uuid);
create or replace function public.calculate_tier_with_grace(
  p_workspace_id uuid,
  p_spend_30d_nanos bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform p_workspace_id;
  perform p_spend_30d_nanos;
  return 'basic';
end;
$$;
create or replace function public.cleanup_dormant_enterprise_workspaces()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'total_teams_checked', 0,
    'teams_downgraded', 0,
    'downgraded_teams', '[]'::jsonb,
    'processed_at', now()
  );
end;
$$;
create or replace function public.get_workspace_tier_info(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean := false;
  v_current_month_nanos bigint := 0;
  v_prev_month_nanos bigint := 0;
  v_current_month_spend numeric(12, 2);
  v_prev_month_spend numeric(12, 2);
  v_current_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc'));
  v_prev_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc')) - interval '1 month';
  v_next_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc')) + interval '1 month';
begin
  select exists(
    select 1 from public.workspaces w where w.id = p_workspace_id
  )
  into v_exists;

  if not v_exists then
    raise exception 'Workspace not found: %', p_workspace_id;
  end if;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_current_month_nanos
  from public.gateway_requests gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_current_month_start_ts
    and gr.created_at < v_next_month_start_ts;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_prev_month_nanos
  from public.gateway_requests gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_prev_month_start_ts
    and gr.created_at < v_current_month_start_ts;

  v_current_month_spend := round((v_current_month_nanos::numeric / 1000000000.0)::numeric, 2);
  v_prev_month_spend := round((v_prev_month_nanos::numeric / 1000000000.0)::numeric, 2);

  return jsonb_build_object(
    'tier', 'basic',
    'tier_display', 'Standard',
    'markup_percentage', 5.00,
    'threshold_usd', 0,
    'current_month_spend_usd', v_current_month_spend,
    'previous_month_spend_usd', v_prev_month_spend,
    'progress_to_enterprise_pct', 100,
    'is_eligible_for_enterprise', false
  );
end;
$$;
-- Remove constraints tied to dropped columns.
alter table public.workspaces
  drop constraint if exists workspaces_invoice_onboarding_status_check,
  drop constraint if exists teams_invoice_onboarding_status_check,
  drop constraint if exists workspaces_invoice_completed_requires_invoice_mode_check,
  drop constraint if exists teams_invoice_completed_requires_invoice_mode_check,
  drop constraint if exists workspaces_invoice_mode_lock_check,
  drop constraint if exists teams_invoice_mode_lock_check;
-- Drop legacy state columns (retain billing_mode and tier for compatibility).
alter table public.workspaces
  drop column if exists tier_updated_at,
  drop column if exists consecutive_low_spend_months,
  drop column if exists enterprise_lock_through_month,
  drop column if exists tier_low_streak_evaluated_month,
  drop column if exists invoice_mode_activated_at,
  drop column if exists invoice_onboarding_status,
  drop column if exists invoice_invited_at,
  drop column if exists invoice_terms_accepted_at,
  drop column if exists invoice_terms_accepted_by_user_id,
  drop column if exists invoice_terms_accepted_by_name;
-- Normalize any existing tier values to the flat-tier baseline.
update public.workspaces
set tier = 'basic'
where coalesce(tier, 'basic') <> 'basic';
-- Remove legacy invoice/tier history tables.
drop table if exists public.workspace_tier_history cascade;
drop table if exists public.workspace_invoice_profiles cascade;
drop table if exists public.workspace_invoices cascade;
-- Remove invoice-specific RPCs now that invoicing tables are removed.
drop function if exists public.get_due_enterprise_invoice_runs(timestamptz);
drop function if exists public.get_team_invoice_preview(uuid);
