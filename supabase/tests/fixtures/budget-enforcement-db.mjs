// Production shapes, trimmed to what migration 20261109160007_budget_enforcement_money_hygiene and
// the functions it replaces read. Shared by supabase/tests/budget-enforcement-money-hygiene.test.mjs
// and the gateway's seed -> SpendLimit Durable Object -> guard test, so both run the real SQL.
import { readFile } from 'node:fs/promises';

const schemasUrl = new URL('../../schemas/', import.meta.url);
export const MIGRATION_FILE = '20261109160007_budget_enforcement_money_hygiene.sql';
export const readSchema = (path) => readFile(new URL(path, schemasUrl), 'utf8');
export const readMigration = () => readFile(new URL(`../../migrations/${MIGRATION_FILE}`, import.meta.url), 'utf8');
// The migrations that precede MIGRATION_FILE: the expected_cost_nanos column (fix/async-billing-20261104's, added, then validated),
// then each new index in its own migration.
export const COLUMN_MIGRATION_FILES = [
  '20261109145505_gateway_requests_expected_cost_nanos.sql',
  '20261109145506_validate_gateway_requests_expected_cost_nanos_check.sql',
];
export const INDEX_MIGRATION_FILES = [
  '20261109145513_gateway_requests_billing_request_index.sql', // fix/async-billing-20261104's
  '20261109160002_gateway_requests_expected_cost_idx.sql',
  '20261109160003_gateway_requests_charged_unsuccessful_cost_idx.sql',
  '20261109160004_gateway_request_charges_applied_cost_idx.sql',
  '20261109160005_credit_ledger_request_charge_movements_idx.sql',
];
export const readIndexMigrations = () => Promise.all(INDEX_MIGRATION_FILES.map((name) =>
  readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8')));
// The table changes that follow MIGRATION_FILE (functions only), one table per migration.
export const TABLE_MIGRATION_FILES = [
  '20261109160008_credit_ledger_drop_client_insert_policy.sql',
  '20261109160009_wallets_revoke_anon_delete.sql',
  '20261109160010_gateway_wallet_reservations_revoke_client_writes.sql',
  '20261109160011_workspace_settings_io_retention_90_days.sql',
  '20261109160012_workspace_department_budgets_comment.sql',
];
export const readTableMigrations = () => Promise.all(TABLE_MIGRATION_FILES.map((name) =>
  readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8')));

// The request-context callees, reduced to what the wrappers need (the key-limit accounting in
// the real ones is tested by gateway-spend-limit-seed and key-weekly-accounting).
const CONTEXT_STUBS = `
  create or replace function public.gateway_fetch_request_context_without_workspace_budget(workspace_id uuid, model text, endpoint text, api_key_id uuid)
    returns jsonb language sql as $$ select jsonb_build_object('workspace_id', workspace_id, 'key_ok', jsonb_build_object('ok', true),
      'key_limit_ok', jsonb_build_object('ok', true), 'credit_ok', jsonb_build_object('ok', true), 'providers', '[]'::jsonb, 'pricing', '{}'::jsonb) $$;
  create or replace function private.gateway_context_access(workspace_id uuid, model text, endpoint text, api_key_id uuid)
    returns jsonb language sql as $$ select jsonb_build_object('workspace_id', workspace_id, 'key_limit_ok', jsonb_build_object('ok', true)) $$;
`;

const STUBS = `
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth; create schema private;
  create table auth.users (id uuid primary key);
  create function public.is_workspace_member(p_workspace_id uuid) returns boolean language sql stable as $$ select true $$;
  create function public.mfa_satisfied() returns boolean language sql stable as $$ select true $$;
  create table public.workspaces (id uuid primary key, billing_mode text not null default 'wallet');
  create table public.keys (id uuid primary key, workspace_id uuid not null, status text not null default 'active',
    expires_at timestamptz, soft_blocked boolean default false, department_id uuid, created_by uuid, oauth_user_id uuid,
    daily_limit_requests bigint, weekly_limit_requests bigint, monthly_limit_requests bigint,
    daily_limit_cost_nanos bigint, weekly_limit_cost_nanos bigint, monthly_limit_cost_nanos bigint);
  create table public.wallets (workspace_id uuid primary key, balance_nanos bigint not null default 0,
    reserved_nanos bigint not null default 0, updated_at timestamptz default now(), auto_top_up_enabled boolean default false,
    low_balance_threshold bigint default 0, auto_top_up_in_flight_until timestamptz, auto_top_up_amount bigint,
    auto_top_up_account_id text, stripe_customer_id text);
  create table public.gateway_wallet_reservations (reservation_id text not null, workspace_id uuid not null,
    amount_nanos bigint not null, status text not null, hold_ref_id text,
    key_id uuid references public.keys(id) on delete set null, request_count integer,
    captured_nanos bigint default 0, released_nanos bigint default 0, settled_amount_nanos bigint, capture_ref_id text,
    release_ref_id text, released_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
    primary key (workspace_id, reservation_id));
  -- Range-partitioned by created_at, as in production.
  create table public.gateway_requests (id uuid default gen_random_uuid(), workspace_id uuid, request_id text,
    endpoint text, model_id text, provider text, status_code integer, success boolean, usage jsonb, cost_nanos bigint,
    currency text, key_id uuid references public.keys(id) on delete set null, detail_metadata jsonb, billing_request_id text,
    created_at timestamptz not null default now()) partition by range (created_at);
  create table public.gateway_requests_2025 partition of public.gateway_requests for values from ('2025-01-01') to ('2026-01-01');
  create table public.gateway_requests_2026 partition of public.gateway_requests for values from ('2026-01-01') to ('2027-01-01');
  create table public.gateway_requests_default partition of public.gateway_requests default;
  -- Production's history index (gateway_requests_workspace_cursor_idx).
  create index gateway_requests_workspace_cursor_idx on public.gateway_requests (workspace_id, created_at desc, id desc);
  -- Production's success-cost indexes, which key and workspace usage read.
  create index gateway_requests_success_key_workspace_cost_idx on public.gateway_requests (key_id, workspace_id, created_at)
    include (cost_nanos) where success is true and key_id is not null;
  create index gateway_requests_success_workspace_cost_idx on public.gateway_requests (workspace_id, created_at)
    include (cost_nanos) where success is true;
  -- And its request id lookup (a captured video hold's audit row).
  create index gateway_requests_workspace_request_created_idx on public.gateway_requests (workspace_id, request_id, created_at desc);
  create table public.workspace_budgets (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
    interval text not null, limit_nanos bigint not null, created_by uuid, created_at timestamptz default now(),
    updated_at timestamptz default now());
  create table public.workspace_departments (id uuid primary key, workspace_id uuid not null, name text not null);
  create table public.workspace_department_grants (workspace_id uuid not null, user_id uuid not null, department_id uuid not null,
    source_type text not null default 'manual', is_primary boolean not null default false, created_at timestamptz not null default now());
  create table public.workspace_member_overrides (workspace_id uuid not null, user_id uuid not null,
    department_override_enabled boolean not null default false, department_id uuid, primary key (workspace_id, user_id));
  create table public.workspace_department_budgets (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
    department_id uuid not null, interval text not null, limit_nanos bigint not null, created_by uuid,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  -- Spend guardrails (phase D), trimmed to what private.spend_guardrail_usage reads: no guardrails here.
  create table if not exists public.workspace_guardrails (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
    enabled boolean not null default true, name text not null default '', kind text not null default 'access',
    spend_limit_nanos bigint, spend_period text, spend_action text, spend_counting text);
  create or replace function public.resolve_key_guardrails(p_workspace_id uuid, p_key_id uuid)
    returns table (guardrail_id uuid, source_type text, source_id uuid) language sql stable as $$ select null::uuid, null::text, null::uuid where false $$;
  create table public.workspace_settings (workspace_id uuid primary key, department_spend_attribution text not null default 'all',
    io_logging_retention_days integer not null default 90,
    routing_mode text, byok_fallback_enabled boolean, beta_channel_enabled boolean, alpha_channel_enabled boolean,
    cache_aware_routing_enabled boolean, privacy_zdr_only boolean, privacy_enable_paid_may_train boolean,
    privacy_enable_free_may_train boolean, privacy_enable_input_output_logging boolean, io_logging_enabled boolean,
    io_logging_include_provider_payloads boolean, data_contribution_enabled boolean, data_contribution_policy_version text,
    data_contribution_sample_rate_bps integer, data_contribution_classifier_sample_rate_bps integer,
    data_contribution_discount_bps integer, response_healing_enabled boolean, response_healing_locked boolean,
    response_healing_mode text,
    constraint workspace_settings_io_logging_retention_days_check check (((io_logging_retention_days >= 90) and (io_logging_retention_days <= 365))));
  create table public.byok_keys (id uuid primary key, workspace_id uuid, provider_id text, fingerprint_sha256 text,
    key_version integer, always_use boolean, enabled boolean);
  create table public.gateway_realtime_sessions (workspace_id uuid not null, session_id text not null, key_id uuid,
    reserved_nanos bigint not null default 0, primary key (workspace_id, session_id));
  create table public.gateway_async_operations (workspace_id uuid not null, kind text not null, internal_id text, status text,
    request_id text, meta jsonb not null default '{}'::jsonb, billed_at timestamptz);
  create table public.gateway_request_charges (workspace_id uuid not null, request_id text not null, cost_nanos bigint,
    status text, deducted_status text, error_message text, auto_top_up_required boolean, overdraft_nanos bigint,
    created_at timestamptz default now(), updated_at timestamptz default now(),
    is_final boolean not null default true, key_id uuid,
    primary key (workspace_id, request_id));
  create table public.credit_ledger (id uuid primary key default gen_random_uuid(), workspace_id uuid, kind text, amount_nanos bigint,
    ref_type text, ref_id text, source_ref_type text, source_ref_id text, status text, created_at timestamptz not null default now());
  grant all on public.credit_ledger to service_role;
  alter table public.credit_ledger enable row level security;
  create policy "Enable insert for users based on user_id" on public.credit_ledger for insert to authenticated
    with check (public.is_workspace_member(workspace_id));
  -- Production grants the migration narrows.
  grant delete, insert, select, trigger, truncate, update on public.gateway_wallet_reservations to anon, authenticated, service_role;
  grant delete, select on public.wallets to anon;
  create function public.wallet_apply_delta(p_workspace_id uuid, p_delta_nanos bigint)
    returns table (before_balance_nanos bigint, after_balance_nanos bigint) language sql as $$ select 0::bigint, 0::bigint $$;
  create table public.v2_private_usage_15m (workspace_id uuid, bucket_start timestamptz, key_id uuid, cost_nanos bigint);
  ${CONTEXT_STUBS}
  -- Callees the migration leaves alone, reduced to what the wrappers need from them.
  create function public.gateway_realtime_create_with_hold_without_workspace_budget(
    p_workspace_id uuid, p_session_id text, p_key_id uuid, p_user_id text, p_source text, p_provider text, p_model_id text,
    p_provider_model_id text, p_voice text, p_expires_at timestamptz, p_reservation_prefix text, p_reservation_id text,
    p_hold_nanos bigint, p_client_secret_hash text, p_metadata jsonb, p_max_workspace_sessions integer,
    p_max_key_sessions integer, p_max_user_sessions integer, p_max_creations_per_minute integer)
    returns setof public.gateway_realtime_sessions language sql as $$
      insert into public.gateway_realtime_sessions (workspace_id, session_id, key_id, reserved_nanos)
      values (p_workspace_id, p_session_id, p_key_id, p_hold_nanos) returning * $$;
  create function public.gateway_realtime_extend_hold_once_without_workspace_budget(
    p_workspace_id uuid, p_session_id text, p_reservation_id text, p_target_reserved_nanos bigint, p_estimated_cost_nanos bigint)
    returns setof public.gateway_realtime_sessions language sql as $$
      update public.gateway_realtime_sessions set reserved_nanos = p_target_reserved_nanos
      where workspace_id = p_workspace_id and session_id = p_session_id returning * $$;
  grant usage on schema private to service_role;
  grant all on all tables in schema public to service_role;
`;

const CALLEES = [
  'private/functions/spend_limit_period.sql',
  'private/functions/department_budget_key_departments.sql',
  'public/functions/lock_workspace_budget_change.sql',
  'public/functions/gateway_wallet_reserve_once_without_workspace_budget.sql',
  'public/functions/gateway_deduct_and_check_top_up_once.sql',
];

/** Applies the migration, then puts the request-context callee stubs back for the wrapper tests. */
export const readColumnMigrations = () => Promise.all(COLUMN_MIGRATION_FILES.map((name) =>
  readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8')));

// fix/async-billing-20261104's first migration: the deploy-relative marker for legacy pending rows.
export const CUTOFF_MIGRATION_FILE = '20261109145504_billing_cutoffs.sql';
export async function applyMigration(db, migration) {
  await db.exec(await readFile(new URL(`../../migrations/${CUTOFF_MIGRATION_FILE}`, import.meta.url), 'utf8'));
  for (const column of await readColumnMigrations()) await db.exec(column);
  for (const index of await readIndexMigrations()) await db.exec(index);
  await db.exec(migration);
  for (const table of await readTableMigrations()) await db.exec(table);
  await db.exec(CONTEXT_STUBS);
}

/** A database in the state the migration finds in production (the migration itself is not applied). */
export async function createBudgetDatabase(PGlite) {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const path of CALLEES) await db.exec(await readSchema(path));
  await db.exec(`
    create trigger workspace_budgets_lock_change before insert or delete or update on public.workspace_budgets
      for each row execute function public.lock_workspace_budget_change();
    create trigger workspace_department_budgets_lock_change before insert or delete or update on public.workspace_department_budgets
      for each row execute function public.lock_workspace_budget_change();
  `);
  return db;
}
