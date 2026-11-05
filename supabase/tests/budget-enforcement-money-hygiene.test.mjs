import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

// Migration 20261104233604_budget_enforcement_money_hygiene against production shapes, trimmed
// to what it reads: department budgets on holds, realtime and the context fallback; one count per
// batch hold in workspace budgets; no budget row lock in reserve; a missing wallet fails the charge;
// dropped and revoked money surfaces; 90-day I/O retention; and video holds in the stale-hold reaper.
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrationFile = '../migrations/20261104233604_budget_enforcement_money_hygiene.sql';
const functionFiles = [
  'public/functions/gateway_department_budget_status.sql',
  'public/functions/gateway_workspace_budget_status.sql',
  'public/functions/gateway_wallet_reserve_once.sql',
  'public/functions/gateway_realtime_create_with_hold.sql',
  'public/functions/gateway_realtime_extend_hold_once.sql',
  'public/functions/gateway_fetch_request_context.sql',
  'public/functions/gateway_fetch_request_context_bundle.sql',
  'public/functions/deduct_and_check_top_up.sql',
  'public/functions/gateway_wallet_release_stale_orphan_batch_reservations.sql',
];
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const DOLLAR = 1_000_000_000;
const WS = id('1', 1); // department budgets
const WS_BATCH = id('1', 2); // workspace budget and batch holds
const WS_REAP = id('1', 3); // stale holds
const NO_WALLET = id('1', 4);
const ENG = id('4', 1);
const MEMBER = id('2', 1);
const KEY = { linked: id('3', 1), member: id('3', 2), outside: id('3', 3), batch: id('3', 4) };
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const asService = async (fn) => { await db.exec('set role service_role'); try { return await fn(); } finally { await db.exec('reset role'); } };
const failures = [];
const check = async (name, fn) => {
  try { await fn(); console.log(`ok - ${name}`); } catch (error) { failures.push(name); console.log(`not ok - ${name}\n  ${error.message.split('\n')[0]}`); }
};
const reserve = (workspace, reservation, nanos, key = null, count = null) => asService(() => one(
  'select * from public.gateway_wallet_reserve_once($1, $2, $3, null, $4, $5)', [workspace, reservation, nanos, key, count]));
const request = (workspace, requestId, key, nanos) => db.query(
  `insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values ($1, $2, $3, true, $4)`,
  [workspace, requestId, key, nanos]);

try {
  await db.exec(`
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
      amount_nanos bigint not null, status text not null, hold_ref_id text, key_id uuid, request_count integer,
      captured_nanos bigint default 0, released_nanos bigint default 0, settled_amount_nanos bigint, capture_ref_id text,
      release_ref_id text, released_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
      primary key (workspace_id, reservation_id));
    create table public.gateway_requests (id uuid default gen_random_uuid(), workspace_id uuid, request_id text,
      endpoint text, model_id text, provider text, status_code integer, success boolean, usage jsonb, cost_nanos bigint,
      currency text, key_id uuid, detail_metadata jsonb, created_at timestamptz default now());
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
    create table public.gateway_async_operations (workspace_id uuid not null, kind text not null, status text,
      request_id text, meta jsonb not null default '{}'::jsonb, billed_at timestamptz);
    create table public.gateway_request_charges (workspace_id uuid not null, request_id text not null, cost_nanos bigint,
      status text, deducted_status text, error_message text, auto_top_up_required boolean, overdraft_nanos bigint,
      created_at timestamptz, updated_at timestamptz, primary key (workspace_id, request_id));
    create table public.credit_ledger (id uuid primary key default gen_random_uuid(), workspace_id uuid, amount_nanos bigint);
    alter table public.credit_ledger enable row level security;
    create policy "Enable insert for users based on user_id" on public.credit_ledger for insert to authenticated
      with check (public.is_workspace_member(workspace_id));
    -- Production grants the migration narrows.
    grant delete, insert, select, trigger, truncate, update on public.gateway_wallet_reservations to anon, authenticated, service_role;
    grant delete, select on public.wallets to anon;
    create function public.wallet_apply_delta(p_workspace_id uuid, p_delta_nanos bigint)
      returns table (before_balance_nanos bigint, after_balance_nanos bigint) language sql as $$ select 0::bigint, 0::bigint $$;
    -- Callees the migration leaves alone, reduced to what the wrappers need from them.
    create function public.gateway_fetch_request_context_without_workspace_budget(workspace_id uuid, model text, endpoint text, api_key_id uuid)
      returns jsonb language sql as $$ select jsonb_build_object('key_limit_ok', jsonb_build_object('ok', true)) $$;
    create function private.gateway_context_access(workspace_id uuid, model text, endpoint text, api_key_id uuid)
      returns jsonb language sql as $$ select jsonb_build_object('workspace_id', workspace_id, 'key_limit_ok', jsonb_build_object('ok', true)) $$;
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
  `);
  for (const path of [
    'private/functions/spend_limit_period.sql',
    'private/functions/department_budget_key_departments.sql',
    'public/functions/lock_workspace_budget_change.sql',
    'public/functions/gateway_wallet_reserve_once_without_workspace_budget.sql',
    'public/functions/gateway_deduct_and_check_top_up_once.sql',
  ]) await db.exec(await read(`../schemas/${path}`));
  await db.exec(`
    create trigger workspace_budgets_lock_change before insert or delete or update on public.workspace_budgets
      for each row execute function public.lock_workspace_budget_change();
    create trigger workspace_department_budgets_lock_change before insert or delete or update on public.workspace_department_budgets
      for each row execute function public.lock_workspace_budget_change();
  `);

  await db.exec(`
    insert into public.workspaces (id) values ('${WS}'), ('${WS_BATCH}'), ('${WS_REAP}'), ('${NO_WALLET}');
    insert into public.workspace_settings (workspace_id) values ('${WS}'), ('${WS_BATCH}');
    insert into public.wallets (workspace_id, balance_nanos, reserved_nanos) values
      ('${WS}', ${1000 * DOLLAR}, 0), ('${WS_BATCH}', ${1000 * DOLLAR}, 0), ('${WS_REAP}', ${1000 * DOLLAR}, ${70 * DOLLAR});
    insert into public.keys (id, workspace_id, department_id, created_by) values
      ('${KEY.linked}', '${WS}', '${ENG}', null), ('${KEY.member}', '${WS}', null, '${MEMBER}'),
      ('${KEY.outside}', '${WS}', null, null), ('${KEY.batch}', '${WS_BATCH}', null, null);
    insert into public.workspace_departments (id, workspace_id, name) values ('${ENG}', '${WS}', 'Engineering');
    insert into public.workspace_department_grants (workspace_id, user_id, department_id) values ('${WS}', '${MEMBER}', '${ENG}');
    insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${WS}', '${ENG}', 'daily', ${10 * DOLLAR});
    insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ('${WS_BATCH}', 'daily', ${10 * DOLLAR});
    -- Stale holds: the reaper's input. Wallet reserved_nanos covers them.
    insert into public.gateway_wallet_reservations (reservation_id, workspace_id, amount_nanos, status, hold_ref_id, created_at) values
      ('video_hold:no-operation', '${WS_REAP}', ${10 * DOLLAR}, 'held', 'video-1', now() - interval '2 days'),
      ('video_hold:queued', '${WS_REAP}', ${10 * DOLLAR}, 'held', 'video-2', now() - interval '2 days'),
      ('video_hold:billed', '${WS_REAP}', ${10 * DOLLAR}, 'held', 'video-3', now() - interval '2 days'),
      ('video_hold:unbilled', '${WS_REAP}', ${10 * DOLLAR}, 'held', 'video-4', now() - interval '2 days'),
      ('video_hold:failed', '${WS_REAP}', ${10 * DOLLAR}, 'reserved', 'video-5', now() - interval '2 days'),
      ('video_hold:recent', '${WS_REAP}', ${10 * DOLLAR}, 'reserved', 'video-6', now() - interval '1 hour'),
      ('batch_hold:orphan', '${WS_REAP}', ${10 * DOLLAR}, 'reserved', 'batch-1', now() - interval '1 hour');
    insert into public.gateway_async_operations (workspace_id, kind, status, request_id, meta, billed_at) values
      ('${WS_REAP}', 'video', 'queued', 'video-2', '{}', null),
      ('${WS_REAP}', 'video', 'completed', null, '{"reservationId": "video_hold:billed"}', now()),
      ('${WS_REAP}', 'video', 'completed', 'video-4', '{}', null),
      ('${WS_REAP}', 'video', 'failed', 'video-5', '{}', null);
  `);

  // The migration carries the declarative definitions and the manifest lists the new function.
  const migration = await read(migrationFile);
  for (const path of functionFiles) {
    assert.ok(migration.includes((await read(`../schemas/${path}`)).replace(/\r\n/g, '\n').trim()), `${path} is in the migration`);
  }
  const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
  for (const list of ['loadOrder', 'files']) {
    assert.ok(manifest[list].includes('public/functions/gateway_department_budget_status.sql'), `new function in ${list}`);
    assert.ok(!manifest[list].includes('public/functions/wallet_apply_delta.sql'), `wallet_apply_delta gone from ${list}`);
  }
  assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /);
  await db.exec(migration);
  await db.exec(migration); // replays cleanly

  await check('the migration releases no hold itself', async () => {
    const held = await rows(`select reservation_id from public.gateway_wallet_reservations where workspace_id = $1 and status in ('held', 'reserved') order by 1`, [WS_REAP]);
    assert.equal(held.length, 7);
  });

  await check('gateway_department_budget_status is service-only SECURITY DEFINER', async () => {
    const fn = await one(`select prosecdef, provolatile from pg_proc where proname = 'gateway_department_budget_status'`);
    assert.deepEqual(fn, { prosecdef: true, provolatile: 's' });
    for (const role of ['anon', 'authenticated']) {
      const { allowed } = await one(`select has_function_privilege($1, 'public.gateway_department_budget_status(uuid, uuid, bigint)', 'execute') as allowed`, [role]);
      assert.equal(allowed, false, role);
    }
  });

  // Fix 1: department budgets hold back holds, realtime and the context fallback.
  await request(WS, 'eng-spend', KEY.linked, 9 * DOLLAR);
  await check('a video hold over the department budget is refused (member key)', async () => {
    const denied = await reserve(WS, 'video_hold:over', 2 * DOLLAR, KEY.member, 1);
    assert.deepEqual([denied.ok, denied.applied, denied.reason], [false, false, 'department_daily_cost_budget_reached']);
  });
  await check('a key outside the department is not held back', async () => {
    const outside = await reserve(WS, 'video_hold:outside', 2 * DOLLAR, KEY.outside, 1);
    assert.deepEqual([outside.ok, outside.applied], [true, true]);
  });
  await check('an active hold counts toward the department', async () => {
    const small = await reserve(WS, 'video_hold:small', DOLLAR / 2, KEY.linked, 1);
    assert.equal(small.ok, true);
    const status = await asService(async () => (await one(`select public.gateway_department_budget_status($1, $2, 0) as r`, [WS, KEY.member])).r);
    assert.equal(Number(status.department_budgets[0].usage_nanos), 9.5 * DOLLAR);
    const batch = await reserve(WS, 'batch_hold:over', 0.6 * DOLLAR, KEY.member, 2);
    assert.equal(batch.reason, 'department_daily_cost_budget_reached');
  });
  await check('realtime create is refused over the department budget', async () => {
    await assert.rejects(asService(() => db.query(`select * from public.gateway_realtime_create_with_hold($1, 'rt-1', $2, null, 'api',
      'openai', 'openai/gpt-live', 'gpt-live', null, now() + interval '1 hour', 'realtime_hold:', 'realtime_hold:rt-1', $3, 'hash')`,
      [WS, KEY.member, DOLLAR])), /department_daily_cost_budget_reached/);
  });
  await check('realtime extend is refused over the department budget', async () => {
    await db.query(`insert into public.gateway_realtime_sessions (workspace_id, session_id, key_id, reserved_nanos) values ($1, 'rt-2', $2, 0)`, [WS, KEY.linked]);
    await assert.rejects(asService(() => db.query(`select * from public.gateway_realtime_extend_hold_once($1, 'rt-2', 'realtime_hold:rt-2', $2, 0)`,
      [WS, DOLLAR])), /department_daily_cost_budget_reached/);
  });
  await request(WS, 'eng-spend-2', KEY.member, DOLLAR / 2);
  await check('the request-context fallback reports a used-up department budget', async () => {
    const context = await asService(async () => (await one(`select public.gateway_fetch_request_context($1, 'lab/model', 'responses', $2) as r`, [WS, KEY.linked])).r);
    assert.equal(context.key_limit_ok.ok, false);
    assert.equal(context.key_limit_ok.reason, 'department_daily_cost_budget_reached');
    assert.equal(context.key_limit_ok.department_id, ENG);
    assert.equal(context.key_limit_ok.department_name, 'Engineering');
    const outside = await asService(async () => (await one(`select public.gateway_fetch_request_context($1, 'lab/model', 'responses', $2) as r`, [WS, KEY.outside])).r);
    assert.equal(outside.key_limit_ok.ok, true);
  });
  await check('the context bundle reports a used-up department budget', async () => {
    const bundle = await asService(async () => (await one(`select public.gateway_fetch_request_context_bundle($1, 'lab/model', 'responses', $2, false) as r`, [WS, KEY.member])).r);
    assert.equal(bundle.context.key_limit_ok.reason, 'department_daily_cost_budget_reached');
  });

  // Fix 2: a reserved batch hold counts once in the workspace budget.
  await check('a batch hold counts once toward the workspace budget', async () => {
    const held = await reserve(WS_BATCH, 'batch_hold:b1', 6 * DOLLAR, KEY.batch, 3);
    assert.equal(held.ok, true);
    const status = await asService(async () => (await one(`select public.gateway_workspace_budget_status($1, 0) as r`, [WS_BATCH])).r);
    assert.equal(Number(status.budgets[0].usage_nanos), 6 * DOLLAR);
    const next = await reserve(WS_BATCH, 'batch_hold:b2', 3 * DOLLAR, KEY.batch, 1);
    assert.equal(next.ok, true, 'a hold that fits next to the first one is admitted');
  });
  await check('a captured batch hold still counts once, through its usage rows', async () => {
    await db.query(`update public.gateway_wallet_reservations set status = 'captured' where reservation_id = 'batch_hold:b1'`);
    const status = await asService(async () => (await one(`select public.gateway_workspace_budget_status($1, 0) as r`, [WS_BATCH])).r);
    assert.equal(Number(status.budgets[0].usage_nanos), 9 * DOLLAR);
  });

  // Fix 3: the advisory lock serializes holds and budget writes; no budget row lock after it.
  await check('gateway_wallet_reserve_once takes no budget row lock', async () => {
    const { def } = await one(`select pg_get_functiondef('public.gateway_wallet_reserve_once(uuid, text, bigint, text, uuid, integer)'::regprocedure) as def`);
    assert.doesNotMatch(def, /from\s+public\.workspace_budgets/i);
    assert.match(def, /pg_advisory_xact_lock\(hashtextextended\(p_workspace_id::text, 0\)\)/);
  });

  // Fix 4: no wallet, no applied charge.
  await check('a charge for a workspace without a wallet fails and is not recorded as applied', async () => {
    await assert.rejects(asService(() => db.query(`select public.deduct_and_check_top_up($1, 100)`, [NO_WALLET])), /wallet_not_found/);
    await assert.rejects(asService(() => db.query(`select * from public.gateway_deduct_and_check_top_up_once($1, 'req-1', 100)`, [NO_WALLET])), /wallet_not_found/);
    const applied = await rows(`select 1 from public.gateway_request_charges where workspace_id = $1 and status = 'applied'`, [NO_WALLET]);
    assert.equal(applied.length, 0);
  });

  // Fix 5: hygiene.
  await check('wallet_apply_delta and the credit_ledger insert policy are gone', async () => {
    assert.equal((await rows(`select 1 from pg_proc where proname = 'wallet_apply_delta'`)).length, 0);
    assert.equal((await rows(`select 1 from pg_policies where tablename = 'credit_ledger' and cmd = 'INSERT'`)).length, 0);
  });
  await check('clients cannot write wallet reservations or delete wallets', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const { allowed } = await one(`select has_table_privilege($1, 'public.gateway_wallet_reservations', $2) as allowed`, [role, privilege]);
        assert.equal(allowed, false, `${role} ${privilege} reservations`);
      }
      const { reads } = await one(`select has_table_privilege($1, 'public.gateway_wallet_reservations', 'SELECT') as reads`, [role]);
      assert.equal(reads, true, `${role} keeps SELECT (RLS decides)`);
    }
    const { deletes } = await one(`select has_table_privilege('anon', 'public.wallets', 'DELETE') as deletes`);
    assert.equal(deletes, false);
  });

  // Fix 6: retention stays at 90 days.
  await check('I/O log retention over 90 days is refused', async () => {
    await assert.rejects(db.query(`update public.workspace_settings set io_logging_retention_days = 180 where workspace_id = $1`, [WS]), /retention_days_check/);
    await db.query(`update public.workspace_settings set io_logging_retention_days = 90 where workspace_id = $1`, [WS]);
  });

  // Fix 7: the reaper releases video holds that billing will never settle.
  await check('the reaper releases stale video holds with no live operation', async () => {
    const released = await asService(async () => (await one(`select public.gateway_wallet_release_stale_orphan_batch_reservations(1800, 100) as n`)).n);
    assert.equal(released, 4);
    const states = Object.fromEntries((await rows(`select reservation_id, status, release_ref_id from public.gateway_wallet_reservations where workspace_id = $1`, [WS_REAP]))
      .map((row) => [row.reservation_id, `${row.status}:${row.release_ref_id ?? ''}`]));
    assert.deepEqual(states, {
      'video_hold:no-operation': 'released:stale_orphan_video_reaper',
      'video_hold:queued': 'held:',
      'video_hold:billed': 'released:stale_orphan_video_reaper',
      'video_hold:unbilled': 'held:',
      'video_hold:failed': 'released:stale_orphan_video_reaper',
      'video_hold:recent': 'reserved:',
      'batch_hold:orphan': 'released:stale_orphan_batch_reaper',
    });
    const { reserved_nanos } = await one(`select reserved_nanos from public.wallets where workspace_id = $1`, [WS_REAP]);
    assert.equal(Number(reserved_nanos), 30 * DOLLAR);
  });

  if (failures.length) throw new Error(`${failures.length} check(s) failed: ${failures.join('; ')}`);
  console.log('budget enforcement and money hygiene: all checks passed');
} finally {
  await db.close();
}
