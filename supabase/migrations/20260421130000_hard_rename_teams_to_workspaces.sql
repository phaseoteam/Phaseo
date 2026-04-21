drop view if exists public.workspace_members;
drop view if exists public.workspaces;

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'team_role'
  ) then
    alter type public.team_role rename to workspace_role;
  end if;
end $$;

alter table if exists public.teams rename to workspaces;
alter table if exists public.team_members rename to workspace_members;
alter table if exists public.team_invites rename to workspace_invites;
alter table if exists public.team_join_requests rename to workspace_join_requests;
alter table if exists public.team_settings rename to workspace_settings;
alter table if exists public.team_guardrails rename to workspace_guardrails;
alter table if exists public.team_broadcast_destinations rename to workspace_broadcast_destinations;
alter table if exists public.team_byok_monthly_usage rename to workspace_byok_monthly_usage;
alter table if exists public.team_invoice_profiles rename to workspace_invoice_profiles;
alter table if exists public.team_invoices rename to workspace_invoices;
alter table if exists public.team_tier_history rename to workspace_tier_history;
alter table if exists public.gateway_usage_rollup_15m_team_provider_model rename to gateway_usage_rollup_15m_workspace_provider_model;
alter table if exists public.gateway_usage_rollup_team_request_state rename to gateway_usage_rollup_workspace_request_state;

do $$
declare
  column_row record;
begin
  for column_row in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'team_id'
  loop
    execute format(
      'alter table %I.%I rename column team_id to workspace_id',
      column_row.table_schema,
      column_row.table_name
    );
  end loop;

  for column_row in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'default_team_id'
  loop
    execute format(
      'alter table %I.%I rename column default_team_id to default_workspace_id',
      column_row.table_schema,
      column_row.table_name
    );
  end loop;
end $$;

do $$
declare
  fn_row record;
begin
  for fn_row in
    select *
    from (
      values
        ('is_team_member', 'is_workspace_member'),
        ('is_team_admin', 'is_workspace_admin'),
        ('get_team_model_last_used', 'get_workspace_model_last_used'),
        ('get_team_key_usage', 'get_workspace_key_usage'),
        ('increment_team_byok_monthly_request_count', 'increment_workspace_byok_monthly_request_count'),
        ('calculate_team_previous_month_spend', 'calculate_workspace_previous_month_spend'),
        ('update_team_tier', 'update_workspace_tier'),
        ('get_team_tier_info', 'get_workspace_tier_info'),
        ('cleanup_dormant_enterprise_teams', 'cleanup_dormant_enterprise_workspaces'),
        ('enforce_team_invoice_mode_lock', 'enforce_workspace_invoice_mode_lock'),
        ('enforce_team_invoice_onboarding_status', 'enforce_workspace_invoice_onboarding_status'),
        ('refresh_gateway_usage_rollups_team_scope', 'refresh_gateway_usage_rollups_workspace_scope'),
        ('is_active_invite_for_team', 'is_active_invite_for_workspace'),
        ('enforce_team_join_request_write_rules', 'enforce_workspace_join_request_write_rules'),
        ('approve_team_join_request', 'approve_workspace_join_request'),
        ('reject_team_join_request', 'reject_workspace_join_request'),
        ('enforce_team_member_role_policy', 'enforce_workspace_member_role_policy'),
        ('enforce_team_invite_role_policy', 'enforce_workspace_invite_role_policy'),
        ('apply_team_usage_rollup_delta', 'apply_workspace_usage_rollup_delta'),
        ('upsert_gateway_request_into_team_usage_rollup', 'upsert_gateway_request_into_workspace_usage_rollup')
    ) as rename_map(old_name, new_name)
  loop
    for column_row in
      select
        n.nspname as schema_name,
        p.proname as function_name,
        pg_get_function_identity_arguments(p.oid) as identity_args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = fn_row.old_name
    loop
      execute format(
        'alter function %I.%I(%s) rename to %I',
        column_row.schema_name,
        column_row.function_name,
        column_row.identity_args,
        fn_row.new_name
      );
    end loop;
  end loop;
end $$;

do $$
declare
  idx_row record;
  next_name text;
begin
  for idx_row in
    select schemaname, indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname like '%team%'
  loop
    next_name := replace(idx_row.indexname, 'team', 'workspace');
    if next_name <> idx_row.indexname then
      execute format(
        'alter index %I.%I rename to %I',
        idx_row.schemaname,
        idx_row.indexname,
        next_name
      );
    end if;
  end loop;
end $$;

do $$
declare
  con_row record;
  next_name text;
begin
  for con_row in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      con.conname as constraint_name
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and con.conname like '%team%'
  loop
    next_name := replace(con_row.constraint_name, 'team', 'workspace');
    if next_name <> con_row.constraint_name then
      execute format(
        'alter table %I.%I rename constraint %I to %I',
        con_row.schema_name,
        con_row.table_name,
        con_row.constraint_name,
        next_name
      );
    end if;
  end loop;
end $$;

do $$
declare
  trig_row record;
  next_name text;
begin
  for trig_row in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      t.tgname as trigger_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and t.tgname like '%team%'
  loop
    next_name := replace(trig_row.trigger_name, 'team', 'workspace');
    if next_name <> trig_row.trigger_name then
      execute format(
        'alter trigger %I on %I.%I rename to %I',
        trig_row.trigger_name,
        trig_row.schema_name,
        trig_row.table_name,
        next_name
      );
    end if;
  end loop;
end $$;
