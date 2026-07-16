-- Remediate live Supabase security-advisor findings without changing the
-- intended authenticated workspace flows.

-- This obsolete dashboard-created policy bypassed the constrained insert
-- policy below because permissive RLS policies are ORed together.
drop policy if exists "Enable insert for authenticated users only"
  on public.workspace_join_requests;

drop policy if exists team_join_requests_insert
  on public.workspace_join_requests;
create policy team_join_requests_insert
  on public.workspace_join_requests
  for insert
  to authenticated
  with check (
    requester_user_id = auth.uid()
    and invite_id is not null
    and status = 'pending'::public.join_request_status
    and decided_by is null
    and decided_at is null
    and not public.is_workspace_member(workspace_id)
    and public.is_active_invite_for_workspace(invite_id, workspace_id)
  );

-- PostgreSQL grants function execution to PUBLIC by default. Keep only the
-- RPCs that validate auth.uid() callable by signed-in users; all remaining
-- SECURITY DEFINER functions listed here are internal gateway, billing,
-- maintenance, or trigger entry points.
do $hardening$
declare
  function_signature regprocedure;
begin
  for function_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (array[
        'apply_workspace_usage_rollup_delta',
        'calculate_tier_with_grace',
        'calculate_workspace_previous_month_spend',
        'cleanup_dormant_enterprise_workspaces',
        'enforce_workspace_invite_role_policy',
        'enforce_workspace_join_request_write_rules',
        'enforce_workspace_member_role_policy',
        'enqueue_welcome_email',
        'gateway_deduct_and_check_top_up_once',
        'gateway_fetch_request_context',
        'gateway_fetch_request_context_with_reservations',
        'gateway_requests_attach_chat_app_id',
        'gateway_wallet_capture_once',
        'gateway_wallet_release_once',
        'gateway_wallet_reserve_once',
        'get_workspace_tier_info',
        'increment_workspace_byok_monthly_request_count',
        'provision_personal_workspace',
        'refresh_gateway_activity_rollup_daily',
        'refresh_public_leaderboard_rollups',
        'refresh_public_model_user_usage_daily',
        'replace_subscription_plan_bundle',
        'rls_auto_enable',
        'stripe_apply_payment_intent_credit',
        'stripe_claim_self_serve_refund',
        'tg_system_settings_audit',
        'update_workspace_tier',
        'upsert_gateway_request_into_workspace_usage_rollup',
        'wallet_apply_delta'
      ]::text[])
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      function_signature
    );
    execute format(
      'grant execute on function %s to service_role',
      function_signature
    );
  end loop;

  for function_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (array[
        'approve_workspace_join_request',
        'get_workspace_key_usage',
        'is_active_invite_for_workspace',
        'is_admin',
        'is_admin_user',
        'is_team_owner',
        'is_workspace_admin',
        'is_workspace_member',
        'monthly_spend_prev_cents',
        'mtd_spend_cents',
        'redeem_credit_code',
        'reject_workspace_join_request'
      ]::text[])
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      function_signature
    );
    execute format(
      'grant execute on function %s to authenticated, service_role',
      function_signature
    );
  end loop;

  -- Pin every still-mutable public function to schemas that untrusted roles
  -- cannot create objects in. Existing explicit search_path settings remain
  -- untouched.
  for function_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'w')
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      )
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, auth, extensions, net',
      function_signature
    );
  end loop;
end
$hardening$;

-- Require future migrations to grant RPC execution deliberately instead of
-- inheriting PostgreSQL's EXECUTE-for-PUBLIC default.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
