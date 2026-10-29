// Standalone PostgreSQL regression test for balance spend rules and the low-balance email sweep.
// Balance rules: the available balance (balance - reserved) at or below an amount, or the runway
// (available / burn per day over window_hours, from the rollup plus async jobs) at or below a
// number of days; one alert per drop (armed/unarmed), cooldown_minutes, re-armed on recovery,
// never while auto top-up is working; the sweep's 15-minute balance slice; the preview.
// Low-balance emails (public.sweep_low_balance_emails), which replace the request-path check:
// the same threshold, recipient, subject and payload as before, one email per drop at most every
// six hours, the same auto top-up rule as the push, first-seen handling, and the Resend mark.
// Runs the spend rules schema, evaluator, API, blocks and balance migrations whole on a minimal
// pre-migration schema, and prints the sweeps' cost per workspace.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/spend-rules-balance.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
const find = (suffix) => migrations.find((name) => name.endsWith(suffix));
const stack = ['_spend_rules_schema.sql', '_spend_rules_evaluator.sql', '_spend_rules_api.sql', '_spend_rule_blocks.sql', '_spend_rules_balance.sql'].map(find);
assert(stack.every(Boolean), 'the spend rules migrations exist');
const migrationName = stack[4];
assert(migrationName > stack[3], 'the balance migration runs after the blocks migration');
const migration = await read(`../migrations/${migrationName}`);
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();

// ---- The migration carries the schema files, the manifest lists the new ones, CI runs this suite.
const added = [
  'public/tables/workspace_low_balance_email_state.sql',
  'private/functions/workspace_auto_top_up_covers.sql',
  'public/functions/sweep_low_balance_emails.sql',
  'private/functions/spend_balance_rule_values.sql',
  'private/functions/spend_balance_alert_text.sql',
];
const redefined = [
  'public/functions/sweep_low_balance_pushes.sql',
  'private/functions/spend_rule_evaluable.sql',
  'private/functions/evaluate_workspace_spend_rules.sql',
  'public/functions/sweep_spend_rules.sql',
  'public/functions/preview_workspace_spend_rule.sql',
];
const laterMigrations = migrations.filter((name) => name > migrationName);
for (const file of [...added, ...redefined]) {
  const signature = file.includes('/tables/') ? `TABLE "public"."${file.split('/').pop().replace(/\.sql$/, '')}"`
    : `FUNCTION ${file.split('/')[0]}.${file.split('/').pop().replace(/\.sql$/, '')}`;
  let newest = migration;
  for (const name of laterMigrations) {
    const sql = await read(`../migrations/${name}`);
    if (sql.includes(signature)) newest = sql;
  }
  assert(normalize(newest).includes(normalize(await read(`../schemas/${file}`))), `${file} is in the newest migration that defines it`);
}
const settingsIndex = normalize(await read('../schemas/public/tables/workspace_settings.sql')).match(/CREATE INDEX workspace_settings_low_balance_email_idx[^;]*;/)?.[0];
assert(settingsIndex && normalize(migration).includes(settingsIndex), 'the email sweep index is declared and migrated');
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of added) for (const list of ['loadOrder', 'files']) assert(manifest[list].includes(file), `${file} is in the manifest's ${list}`);
assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /, 'the sweep replacement is marked as reviewed');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/spend-rules-balance\.test\.mjs/, 'CI runs this suite');
assert.doesNotMatch(await read('../../apps/api/src/pipeline/pricing/persist.ts'), /low_balance|workspace_settings|from\("wallets"\)/,
  'the gateway no longer reads low-balance settings or the wallet after a charge');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const W1 = id(1); // balance rule
const W2 = id(2); // runway rule
const W3 = id(3); // auto top-up
const owner = id(11);
const ada = id(12);
const K1 = id(21);
const DOLLAR = 1e9;
const nanos = (dollars) => Math.round(dollars * DOLLAR);

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const count = async (sql, params) => (await one(`select count(*)::int n from ${sql}`, params)).n;

try {
  await db.exec(`
    set timezone = 'UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to authenticated, service_role;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.users (user_id uuid primary key, display_name text);
    create table public.workspaces (id uuid primary key, name text, owner_user_id uuid);
    create table public.workspace_members (workspace_id uuid not null references public.workspaces(id) on delete cascade, user_id uuid not null, role text not null default 'member', primary key (workspace_id, user_id));
    create table public.workspace_departments (id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade, name text not null, constraint workspace_departments_id_workspace_id_key unique (id, workspace_id));
    create table public.workspace_department_grants (workspace_id uuid not null, user_id uuid not null, department_id uuid not null,
      source_type text not null default 'manual', source_id uuid not null default gen_random_uuid(), is_primary boolean not null default false,
      created_at timestamptz not null default now(), primary key (workspace_id, user_id, department_id, source_type, source_id));
    create table public.workspace_member_overrides (workspace_id uuid not null, user_id uuid not null,
      department_override_enabled boolean not null default false, department_id uuid, primary key (workspace_id, user_id));
    create table public.keys (id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade, name text not null,
      created_by uuid not null, oauth_user_id uuid, key_kind text not null default 'standard', department_id uuid, status text not null default 'active',
      daily_limit_cost_nanos bigint not null default 0, weekly_limit_cost_nanos bigint not null default 0, monthly_limit_cost_nanos bigint not null default 0);
    create table public.management_keys (id uuid primary key, workspace_id uuid, created_by uuid);
    create table public.oauth_clients (id text primary key, allowed_scopes text[], updated_at timestamptz);
    create table public.workspace_budgets (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, interval text not null, limit_nanos bigint not null, unique (workspace_id, interval));
    create table public.notification_destinations (id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
      status text not null default 'active', is_ephemeral boolean not null default false);
    create table public.notification_event_destinations (
      workspace_id uuid not null, event_kind text not null, destination_id uuid not null,
      constraint notification_event_destinations_event_kind_check CHECK ((event_kind = ANY (ARRAY['low_balance'::text]))),
      primary key (workspace_id, event_kind, destination_id));
    create table public.notification_routed_events (event_id uuid primary key, workspace_id uuid not null, routed_at timestamptz not null default now());
    create table public.notification_delivery_attempts (id uuid primary key default gen_random_uuid(), event_id uuid not null, destination_id uuid not null,
      workspace_id uuid not null, status text not null, unique (event_id, destination_id));
    create table public.email_outbox (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), kind text not null,
      template text not null default 'generic', to_email text not null, subject text,
      workspace_id uuid references public.workspaces(id) on delete set null, user_id uuid, payload jsonb not null default '{}',
      attempts integer not null default 0, sent_at timestamptz, dedupe_key text unique);
    create table public.workspace_audit_events (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), workspace_id uuid,
      actor_user_id uuid, action text, target_type text, target_id text, target_name text, metadata jsonb);
    create table public.workspace_settings (workspace_id uuid primary key references public.workspaces(id) on delete cascade,
      department_spend_attribution text not null default 'all',
      low_balance_email_enabled boolean not null default false, low_balance_email_threshold_nanos bigint not null default 0,
      low_balance_email_last_sent_at timestamptz, low_balance_email_last_sent_balance_nanos bigint,
      auto_top_up_failure_email_enabled boolean not null default true, updated_at timestamptz not null default now());
    create table public.wallets (workspace_id uuid primary key references public.workspaces(id) on delete cascade, balance_nanos bigint not null default 0,
      reserved_nanos bigint not null default 0, auto_top_up_enabled boolean not null default false, low_balance_threshold bigint not null default 0,
      auto_top_up_amount bigint not null default 0);
    create table public.credit_ledger (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, kind text not null default 'top_up',
      amount_nanos bigint not null, ref_type text, created_at timestamptz not null default now());
    create table public.gateway_requests (id uuid primary key default gen_random_uuid(), created_at timestamptz not null, workspace_id uuid not null,
      key_id uuid, oauth_user_id uuid, endpoint text not null, success boolean, cost_nanos bigint, model_id text, provider text);
    create table public.v2_models (model_slug text primary key, name text not null);
    create table public.v2_model_provider_routes (provider_model_id text primary key, model_slug text not null, provider_slug text not null);
  `);
  await db.exec((await read('../schemas/public/tables/v2_private_usage_15m.sql')).replace(/,\r?\n  CONSTRAINT "v2_private_usage_15m_workspace_id_fkey"[^\r\n]*/, ''));
  for (const file of [
    'public/functions/set_updated_at_if_changed.sql',
    'public/functions/is_workspace_member.sql',
    'public/tables/workspace_notification_events.sql',
    'public/tables/workspace_notification_cursors.sql',
    'private/functions/workspace_push_usd.sql',
    'private/functions/workspace_push_message.sql',
    'private/functions/spend_scope_departments.sql',
  ]) await db.exec(await read(`../schemas/${file}`));
  for (const name of stack) await db.exec(await read(`../migrations/${name}`));

  // ---- Grants: service role only; the email state is not readable by clients.
  const functions = ['workspace_auto_top_up_covers', 'sweep_low_balance_emails', 'spend_balance_rule_values', 'spend_balance_alert_text',
    'evaluate_workspace_spend_rules', 'sweep_spend_rules', 'preview_workspace_spend_rule', 'sweep_low_balance_pushes'];
  const grants = await rows(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') authenticated, has_function_privilege('service_role', p.oid, 'execute') service
    from pg_proc p where p.proname = any($1)`, [functions]);
  assert.equal(grants.length, functions.length, 'one definition of each');
  for (const grant of grants) {
    assert.equal(grant.anon, false, `${grant.proname}: anon`);
    assert.equal(grant.authenticated, false, `${grant.proname}: authenticated`);
    assert.equal(grant.service, true, `${grant.proname}: service_role`);
  }
  assert.equal((await one(`select has_table_privilege('authenticated', 'public.workspace_low_balance_email_state', 'select') ok`)).ok, false);
  assert.deepEqual((await rows(`select private.spend_rule_evaluable(m, p, b) ok from (values
    ('balance', 'rolling', null), ('spend', 'month', null), ('spend', 'rolling', null), ('spike', 'rolling', null), ('forecast', 'month', null)) v(m, p, b)`)).map((r) => r.ok),
  [true, true, false, false, false], 'balance rules are evaluated; other rolling metrics are not yet');

  // ---- Fixture. NOW is a fixed hour; usage sits in the hour before it.
  const NOW = (await one(`select date_trunc('hour', now()) t`)).t.toISOString();
  const at = (minutes) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();
  await db.exec(`
    insert into auth.users values ('${owner}', 'owner@example.com', '{"full_name": "Grace  Hopper"}'), ('${ada}', 'ada@example.com', '{"first_name": " Ada "}');
    insert into public.workspaces values ('${W1}', 'Acme', '${owner}'), ('${W2}', 'Runway', '${owner}'), ('${W3}', 'Auto', '${owner}');
    insert into public.workspace_members values ('${W1}', '${owner}', 'owner'), ('${W2}', '${owner}', 'owner'), ('${W3}', '${owner}', 'owner');
    insert into public.workspace_settings (workspace_id) values ('${W1}'), ('${W2}'), ('${W3}');
    insert into public.wallets (workspace_id, balance_nanos) values ('${W1}', ${nanos(20)}), ('${W2}', ${nanos(10)}), ('${W3}', ${nanos(20)});
    insert into public.keys (id, workspace_id, name, created_by) values ('${K1}', '${W2}', 'prod', '${owner}');
    insert into public.v2_models values ('openai/gpt-5', 'GPT-5');
    insert into public.v2_model_provider_routes values ('route-gpt', 'openai/gpt-5', 'openai');
  `);
  const wallet = async (workspace, dollars, reserved = 0) =>
    db.query('update public.wallets set balance_nanos = $2, reserved_nanos = $3 where workspace_id = $1', [workspace, nanos(dollars), nanos(reserved)]);
  const addUsage = async (workspace, dollars, bucket) => db.query(`insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, actor_user_id, requests, successful_requests, cost_nanos)
      values ($1, $2, 'openai/gpt-5', 'route-gpt', $3, $4, 1, 1, $5)
      on conflict (workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok, actor_user_id)
      do update set cost_nanos = public.v2_private_usage_15m.cost_nanos + excluded.cost_nanos`, [workspace, bucket, K1, owner, nanos(dollars)]);
  const rule = async (name, values, workspace) => (await one(
    `insert into public.workspace_spend_rules (workspace_id, name, metric, period, ${Object.keys(values).join(', ')})
     values ($1, $2, 'balance', 'rolling', ${Object.keys(values).map((_, i) => `$${i + 3}`).join(', ')}) returning id`,
    [workspace, name, ...Object.values(values)])).id;
  const evaluate = async (workspace, now = NOW) => (await one('select private.evaluate_workspace_spend_rules($1, $2::timestamptz, false) r', [workspace, now])).r;
  const sweep = async (now = NOW) => (await one('select public.sweep_spend_rules($1::timestamptz, 100, false) r', [now])).r;
  const state = async (ruleId) => one(`select armed, last_fired_at, fire_count, amount_fired_at, last_value_nanos, xmin::text v
    from public.workspace_spend_rule_state where rule_id = $1 and period_start = '-infinity'`, [ruleId]);
  const alerts = async (ruleId) => rows(`select payload, dedupe_key, subject, to_email from public.email_outbox
    where kind = 'spend_alert' and payload ->> 'rule_id' = $1 order by created_at, dedupe_key`, [ruleId]);
  const preview = async (workspace, ruleId, now = NOW) => (await one('select public.preview_workspace_spend_rule($1, $2, $3::timestamptz) p', [workspace, ruleId, now])).p;

  // ---- Balance threshold: available = balance - reserved, at or below $10.
  const B1 = await rule('Low balance', { window_hours: 24, threshold_amount_nanos: nanos(10), cooldown_minutes: 360 }, W1);
  let result = await evaluate(W1);
  assert.equal(result.rules, 1, 'the balance rule is evaluated');
  assert.equal(result.fired, 0, '$20 available: above $10');
  assert.equal(result.state_rows, 0, 'a quiet, armed rule writes nothing');
  assert.equal(await state(B1), undefined);
  let shown = await preview(W1, B1);
  assert.equal(shown.evaluated, true);
  assert.equal(Number(shown.value_nanos), nanos(20));
  assert.equal(shown.period.kind, 'rolling');
  assert.equal(Date.parse(shown.period.end) - Date.parse(shown.period.start), 24 * 3600e3, 'the preview period is the burn window');
  assert.deepEqual({ ...shown.balance, burn_nanos: Number(shown.balance.burn_nanos), burn_per_day_nanos: Number(shown.balance.burn_per_day_nanos) }, {
    balance_nanos: nanos(20), reserved_nanos: 0, available_nanos: nanos(20), window_hours: 24, burn_nanos: 0, burn_per_day_nanos: 0,
    runway_days_left: null, runway_days: null, low_balance: false, low_runway: false, armed: true, auto_top_up_covers: false,
  });
  assert.equal(shown.alert.title, 'Low balance: balance at or below $10.00', 'the preview shows the alert it would send');
  assert.equal(shown.state, null);

  await wallet(W1, 12, 3); // $9 available: the gateway admits against balance - reserved
  result = await evaluate(W1);
  assert.equal(result.fired, 1, 'a drop to $9 fires');
  assert.equal(result.events[0].rule_id, B1);
  assert.equal(Number(result.events[0].threshold), nanos(10));
  assert.equal(result.events[0].trigger, 'balance');
  let [fired] = await alerts(B1);
  assert.match(fired.dedupe_key, new RegExp(`^spend_alert:${B1}:cooldown:\\d+:balance$`));
  assert.equal(fired.subject, 'Low balance: balance at or below $10.00');
  assert.equal(fired.to_email, 'owner@example.com');
  assert.equal(fired.payload.metric, 'balance');
  assert.equal(fired.payload.trigger, 'balance');
  assert.equal(Number(fired.payload.value_nanos), nanos(9));
  assert.equal(Number(fired.payload.balance_nanos), nanos(12));
  assert.equal(Number(fired.payload.reserved_nanos), nanos(3));
  assert.deepEqual(fired.payload.scope, { type: 'workspace', label: 'Acme' });
  assert.equal(fired.payload.period.kind, 'rolling');
  assert.equal(fired.payload.push.href, '/settings/credits');
  assert.equal(fired.payload.message,
    'The workspace balance is $9.00, at or below the $10.00 alert threshold. There was no spend in the last 24 hours. Top up credits in Settings > Credits.');
  let saved = await state(B1);
  assert.equal(saved.armed, false, 'unarmed after the drop');
  assert.equal(saved.fire_count, 1);
  assert.equal(Number(saved.last_value_nanos), nanos(9));
  assert.ok(saved.amount_fired_at);

  result = await evaluate(W1);
  assert.equal(result.fired, 0, 'still low: no repeat');
  assert.equal(result.state_rows, 0);
  assert.equal((await state(B1)).v, saved.v, 'an unarmed, still-low rule is not written');

  await wallet(W1, 30);
  result = await evaluate(W1);
  assert.equal(result.fired, 0);
  assert.equal(result.state_rows, 1, 'recovery is written');
  assert.equal((await state(B1)).armed, true, 're-armed once the balance is back above the threshold');
  assert.equal(Number((await state(B1)).fire_count), 1);

  await wallet(W1, 5);
  result = await evaluate(W1, at(60));
  assert.equal(result.fired, 0, 'a second drop inside the six-hour cooldown waits');
  assert.equal((await state(B1)).armed, true, 'and stays armed');
  result = await evaluate(W1, at(6 * 60 + 1));
  assert.equal(result.fired, 1, 'the cooldown ends with the balance still low: it fires');
  assert.equal((await alerts(B1)).length, 2);
  assert.equal((await state(B1)).armed, false);
  assert.equal(Number((await state(B1)).fire_count), 2);
  shown = await preview(W1, B1, at(6 * 60 + 2));
  assert.equal(shown.state.armed, false);
  assert.equal(shown.state.fire_count, 2);
  assert.equal(shown.balance.low_balance, true);

  // ---- Runway: available / (burn over window_hours, per day) at or below runway_days.
  const R1 = await rule('Runway', { window_hours: 24, runway_days: 3, cooldown_minutes: 60 }, W2);
  assert.equal((await evaluate(W2)).fired, 0, 'no spend: no runway, no alert');
  await addUsage(W2, 4, at(-60));
  await addUsage(W2, 1, at(-30 * 60)); // outside the 24-hour window
  await db.query(`insert into public.gateway_requests (created_at, workspace_id, key_id, endpoint, success, cost_nanos) values
    ($1, $2, $3, 'batch', true, $4), ($1, $2, $3, 'batch', false, $5), ($1, $2, $3, 'chat.completions', true, $5)`, [at(-120), W2, K1, nanos(1), nanos(50)]);
  shown = await preview(W2, R1);
  assert.equal(Number(shown.balance.burn_nanos), nanos(5), 'rollup + successful async jobs in the window; failed jobs and rollup-covered endpoints are not added');
  assert.equal(Number(shown.balance.burn_per_day_nanos), nanos(5));
  assert.equal(Number(shown.balance.runway_days_left), 2);
  assert.equal(shown.balance.low_runway, true);
  result = await evaluate(W2);
  assert.equal(result.fired, 1, '2 days of runway: at or below 3');
  [fired] = await alerts(R1);
  assert.equal(fired.payload.trigger, 'runway');
  assert.match(fired.dedupe_key, /:runway$/);
  assert.equal(fired.subject, 'Runway: about 2.0 days of credit left');
  assert.equal(fired.payload.message,
    'The workspace balance is $10.00. Spend over the last 24 hours averages $5.00 a day, so it lasts about 2.0 days (alert at 3 days). Top up credits in Settings > Credits.');
  // A longer window spreads the same spend over more days.
  const R2 = await rule('Runway weekly', { window_hours: 48, runway_days: 3 }, W2);
  shown = await preview(W2, R2);
  assert.equal(Number(shown.balance.burn_nanos), nanos(6), 'the 48-hour window includes the older usage');
  assert.equal(Number(shown.balance.burn_per_day_nanos), nanos(3));
  assert.equal(Number(shown.balance.runway_days_left), 3.33);
  assert.equal(shown.balance.low_runway, false);
  assert.equal((await evaluate(W2)).fired, 0, '3.3 days: above 3');
  await wallet(W2, 30);
  result = await evaluate(W2);
  assert.equal((await state(R1)).armed, true, 'runway recovered: re-armed');

  // ---- Auto top-up working: the drop is recorded without an alert, as for the push.
  await db.query(`update public.wallets set auto_top_up_enabled = true, auto_top_up_amount = $2, low_balance_threshold = $3 where workspace_id = $1`, [W3, nanos(10), nanos(5)]);
  const A1 = await rule('Auto', { window_hours: 24, threshold_amount_nanos: nanos(10) }, W3);
  assert.equal((await one('select private.workspace_auto_top_up_covers($1) c', [W3])).c, true);
  await wallet(W3, 4);
  result = await evaluate(W3);
  assert.equal(result.fired, 0, 'auto top-up covers the drop');
  assert.equal(result.state_rows, 1);
  assert.equal((await state(A1)).armed, false, 'recorded as a drop');
  assert.equal((await state(A1)).fire_count, 0);
  await wallet(W3, 14);
  await evaluate(W3);
  assert.equal((await state(A1)).armed, true);
  // A failed top-up with no card payment since: auto top-up is not working.
  await db.query(`insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, payload, occurred_at)
    values ($1, 'auto_top_up_failed', 'money', 'failed-1', '{}', $2)`, [W3, at(-10)]);
  assert.equal((await one('select private.workspace_auto_top_up_covers($1) c', [W3])).c, false);
  await wallet(W3, 4);
  assert.equal((await evaluate(W3)).fired, 1, 'a failed top-up: the drop alerts');
  await db.query(`insert into public.credit_ledger (workspace_id, amount_nanos, ref_type, created_at) values ($1, $2, 'Stripe_Payment_Intent', $3)`, [W3, nanos(10), at(-5)]);
  assert.equal((await one('select private.workspace_auto_top_up_covers($1) c', [W3])).c, true, 'a card payment since the failure: working again');
  await db.query(`update public.workspace_settings set auto_top_up_failure_email_enabled = false where workspace_id = $1`, [W3]);
  assert.equal((await one('select private.workspace_auto_top_up_covers($1) c', [W3])).c, false, 'failure alerts off: a drop is not left to auto top-up');
  await db.query(`update public.workspace_settings set auto_top_up_failure_email_enabled = true where workspace_id = $1`, [W3]);
  assert.equal((await one(`select private.workspace_auto_top_up_covers('${id(99)}') c`)).c, false, 'no wallet: not covered');

  // ---- Disabled and deleted balance rules are not evaluated.
  await db.query('update public.workspace_spend_rules set enabled = false where id = $1', [A1]);
  assert.equal((await evaluate(W3)).rules, 0);
  await db.query('update public.workspace_spend_rules set enabled = true, deleted_at = now() where id = $1', [A1]);
  assert.equal((await evaluate(W3)).rules, 0);

  // ---- The sweep: workspaces with balance rules are evaluated every 15 minutes without a dirty mark.
  await db.exec('delete from public.workspace_spend_rule_dirty');
  const withBalance = (await one(`select count(distinct workspace_id)::int n from public.workspace_spend_rules
    where metric = 'balance' and enabled and deleted_at is null`)).n;
  assert.equal(withBalance, 2);
  const seen = new Map();
  for (let slot = 0; slot < 3; slot += 1) {
    const swept = await sweep(at(slot * 5));
    assert.equal(swept.dirty, 0);
    assert.equal(typeof swept.balance, 'number');
    seen.set(slot, swept.periodic + swept.balance);
  }
  assert.equal([...seen.values()].reduce((a, b) => a + b, 0), withBalance, 'each workspace with balance rules once every three 5-minute calls');

  // ---- Low-balance email sweep: the old request-path behaviour, as a sweep.
  const E = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const emailWs = { main: E(1), zero: E(2), off: E(3), auto: E(4), lowNever: E(5), lowSent: E(6), empty: E(7), noOwner: E(8), negative: E(9) };
  for (const [name, workspace] of Object.entries(emailWs)) {
    await db.query('insert into public.workspaces values ($1, $2, $3)', [workspace, `Team ${name}`, name === 'noOwner' ? id(98) : ada]);
    await db.query('insert into public.workspace_settings (workspace_id, low_balance_email_enabled, low_balance_email_threshold_nanos) values ($1, $2, $3)',
      [workspace, name !== 'off', name === 'zero' ? 0 : nanos(10)]);
    await db.query('insert into public.wallets (workspace_id, balance_nanos) values ($1, $2)', [workspace, nanos(20)]);
  }
  await wallet(emailWs.lowNever, 6);
  await wallet(emailWs.lowSent, 6);
  await wallet(emailWs.empty, 0);
  await wallet(emailWs.zero, 1);
  await wallet(emailWs.negative, 20);
  await db.query(`update public.workspace_settings set low_balance_email_last_sent_at = $2, low_balance_email_last_sent_balance_nanos = $3 where workspace_id = $1`,
    [emailWs.lowSent, at(-24 * 60), nanos(7)]);
  await db.query(`update public.wallets set auto_top_up_enabled = true, auto_top_up_amount = $2, low_balance_threshold = $3 where workspace_id = $1`,
    [emailWs.auto, nanos(10), nanos(5)]);
  const emailSweep = async (now = NOW, markSent = false) => (await one('select public.sweep_low_balance_emails($1::timestamptz, $2) r', [now, markSent])).r;
  const emails = async (workspace) => rows(`select kind, template, to_email, subject, user_id, workspace_id, payload, dedupe_key, sent_at
    from public.email_outbox where kind = 'low_balance' and workspace_id = $1 order by created_at, dedupe_key`, [workspace]);
  const emailState = async (workspace) => one('select armed, last_alert_at, xmin::text v from public.workspace_low_balance_email_state where workspace_id = $1', [workspace]);
  const settings = async (workspace) => one('select low_balance_email_last_sent_at, low_balance_email_last_sent_balance_nanos from public.workspace_settings where workspace_id = $1', [workspace]);
  const stamp = async () => (await one(`select coalesce(string_agg(workspace_id || ':' || xmin, ',' order by workspace_id), '') s from public.workspace_low_balance_email_state`)).s;

  let swept = await emailSweep();
  // First sight: above the threshold armed; low with credit and never emailed: emailed now (the
  // old check would have on its next charge); low but already emailed, or empty: unarmed.
  assert.equal(swept.watched, 8, 'workspaces with the email on and a wallet (not the one with it off)');
  assert.equal(swept.firstSeen, 8);
  assert.equal(swept.emailed, 1);
  assert.deepEqual((await emails(emailWs.lowNever)).length, 1, 'low, with credit, never emailed: emailed on first sight');
  assert.deepEqual((await emails(emailWs.lowSent)).length, 0, 'low and emailed before by the request path: not repeated');
  assert.deepEqual((await emails(emailWs.empty)).length, 0, 'never had credit: never told');
  assert.equal((await emailState(emailWs.main)).armed, true);
  assert.equal((await emailState(emailWs.lowSent)).armed, false);
  assert.equal(await count(`public.workspace_low_balance_email_state where workspace_id = '${emailWs.off}'`), 0, 'emails off: not watched');
  const idle = await stamp();
  swept = await emailSweep(at(1));
  assert.equal(swept.emailed, 0);
  assert.equal(await stamp(), idle, 'an idle sweep writes nothing');

  await wallet(emailWs.main, 8.5);
  swept = await emailSweep(at(5));
  assert.equal(swept.emailed, 1);
  assert.equal(swept.dropped, 1);
  const [email] = await emails(emailWs.main);
  // The row the request path wrote (apps/api/src/pipeline/notifications/low-balance.ts before this change).
  assert.deepEqual({ ...email, payload: undefined, dedupe_key: undefined, sent_at: undefined }, {
    kind: 'low_balance', template: 'low_balance', to_email: 'ada@example.com', subject: 'Low balance alert', user_id: ada,
    workspace_id: emailWs.main, payload: undefined, dedupe_key: undefined, sent_at: undefined,
  });
  assert.deepEqual(Object.keys(email.payload).sort(), ['balance_nanos', 'balance_usd', 'team_name', 'threshold_nanos', 'threshold_usd', 'user_first_name', 'workspace_id']);
  assert.deepEqual({ ...email.payload, balance_usd: Number(email.payload.balance_usd), threshold_usd: Number(email.payload.threshold_usd) }, {
    user_first_name: 'Ada', workspace_id: emailWs.main, team_name: 'Team main', balance_nanos: nanos(8.5), balance_usd: 8.5,
    threshold_nanos: nanos(10), threshold_usd: 10,
  });
  assert.equal(email.sent_at, null, 'without Resend automations the outbox drain sends it');
  assert.match(email.dedupe_key, new RegExp(`^low_balance_email:${emailWs.main}:\\d{4}-\\d{2}-\\d{2}T`));
  assert.equal((await settings(emailWs.main)).low_balance_email_last_sent_at.toISOString(), at(5), 'the cooldown column is kept');
  assert.equal(Number((await settings(emailWs.main)).low_balance_email_last_sent_balance_nanos), nanos(8.5));
  assert.equal((await emailState(emailWs.main)).armed, false);
  assert.equal(swept.emails.length, 1);
  assert.deepEqual(Object.keys(swept.emails[0]).sort(), ['balance_nanos', 'balance_usd', 'id', 'team_name', 'threshold_nanos', 'threshold_usd', 'to_email', 'user_first_name', 'workspace_id']);

  await wallet(emailWs.main, 7);
  assert.equal((await emailSweep(at(10))).emailed, 0, 'still low: one email per drop');
  await wallet(emailWs.main, 12);
  swept = await emailSweep(at(15));
  assert.equal(swept.rearmed, 1);
  assert.equal((await emailState(emailWs.main)).armed, true);
  await wallet(emailWs.main, 9);
  swept = await emailSweep(at(20));
  assert.equal(swept.emailed, 0, 'a new drop inside six hours of the last email waits, as the request path did');
  assert.equal(swept.waiting, 1);
  assert.equal((await emailState(emailWs.main)).armed, true);
  swept = await emailSweep(at(5 + 6 * 60), true);
  assert.equal(swept.emailed, 1, 'six hours later, still low: emailed');
  const [, second] = await emails(emailWs.main);
  assert.equal(second.sent_at.toISOString(), at(5 + 6 * 60), 'with Resend automations the row is written as sent for the event');
  assert.equal(swept.emails[0].to_email, 'ada@example.com');
  // A lowered threshold (the last email's balance is above it) does not hold the cooldown.
  await wallet(emailWs.main, 30);
  await emailSweep(at(6 * 60 + 10));
  await db.query('update public.workspace_settings set low_balance_email_threshold_nanos = $2 where workspace_id = $1', [emailWs.main, nanos(5)]);
  await wallet(emailWs.main, 4);
  assert.equal((await emailSweep(at(6 * 60 + 15))).emailed, 1, 'threshold lowered below the last emailed balance: the cooldown does not apply');

  // $0 threshold: alerts once the balance reaches $0, at $0.00.
  await wallet(emailWs.zero, 0);
  await emailSweep(at(30));
  const [zero] = await emails(emailWs.zero);
  assert.equal(Number(zero.payload.balance_usd), 0);
  assert.equal(Number(zero.payload.threshold_usd), 0);
  // A negative balance is shown as $0.00, as before.
  await db.query('update public.wallets set balance_nanos = $2 where workspace_id = $1', [emailWs.negative, -nanos(2)]);
  await emailSweep(at(35));
  const [negative] = await emails(emailWs.negative);
  assert.equal(Number(negative.payload.balance_usd), 0);
  assert.equal(Number(negative.payload.balance_nanos), -nanos(2));
  // Auto top-up working: the drop is recorded without an email, as for the push.
  await wallet(emailWs.auto, 3);
  swept = await emailSweep(at(40));
  assert.equal(swept.coveredByTopUp, 1);
  assert.equal((await emails(emailWs.auto)).length, 0);
  assert.equal((await emailState(emailWs.auto)).armed, false);
  // No owner email: nothing is queued.
  await wallet(emailWs.noOwner, 2);
  await emailSweep(at(45));
  assert.equal((await emails(emailWs.noOwner)).length, 0);
  // First names: first_name, else given_name, full_name or name, first word; else "there".
  await db.query(`update public.workspaces set owner_user_id = $2 where id = $1`, [emailWs.lowSent, owner]);
  await wallet(emailWs.lowSent, 20);
  await emailSweep(at(50));
  await wallet(emailWs.lowSent, 1);
  await emailSweep(at(55));
  assert.equal((await emails(emailWs.lowSent))[0].payload.user_first_name, 'Grace', 'full_name, first word');
  await assert.rejects(db.query('select public.sweep_low_balance_emails(null)'), /invalid_low_balance_email_sweep_time/);

  // ---- Cost: per-workspace time of the spend rules sweep (balance slice) and the email sweep.
  const many = 300;
  await db.exec(`
    insert into public.workspaces (id, name, owner_user_id)
      select ('f0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Perf ' || n, '${owner}' from generate_series(1, ${many}) n;
    insert into public.workspace_settings (workspace_id, low_balance_email_enabled, low_balance_email_threshold_nanos)
      select id, true, ${nanos(5)} from public.workspaces where name like 'Perf %';
    insert into public.wallets (workspace_id, balance_nanos) select id, ${nanos(50)} from public.workspaces where name like 'Perf %';
    insert into public.workspace_spend_rules (workspace_id, name, metric, period, window_hours, threshold_amount_nanos, runway_days)
      select id, 'Perf balance', 'balance', 'rolling', 168, ${nanos(5)}, 7 from public.workspaces where name like 'Perf %';
    insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, requests, successful_requests, cost_nanos)
      select w.id, '${NOW}'::timestamptz - make_interval(mins => 15 * b), 'openai/gpt-5', 'route-gpt', 1, 1, 1000000
      from public.workspaces w cross join generate_series(1, 96) b where w.name like 'Perf %';
  `);
  let started = performance.now();
  let total = 0;
  for (let slot = 0; slot < 3; slot += 1) total += (await one('select public.sweep_spend_rules($1::timestamptz, 1000, false) r', [at(24 * 60 + slot * 5)])).r.evaluated;
  const rulesMs = performance.now() - started;
  assert.ok(total >= many, 'every perf workspace is evaluated within three calls');
  started = performance.now();
  await emailSweep(at(25 * 60));
  const emailMs = performance.now() - started;
  started = performance.now();
  const quietSweep = await emailSweep(at(25 * 60 + 1));
  const quietMs = performance.now() - started;
  assert.equal(quietSweep.saved, 0, 'nothing changed: nothing written');
  const watchedNow = quietSweep.watched;
  console.log(JSON.stringify({ balance_rules_sweep: { workspaces: total, ms: Math.round(rulesMs), ms_per_workspace: +(rulesMs / total).toFixed(2) },
    low_balance_email_sweep: { watched: watchedNow, first_ms: Math.round(emailMs), quiet_ms: Math.round(quietMs), quiet_ms_per_workspace: +(quietMs / watchedNow).toFixed(3) } }));
  assert.ok(rulesMs / total < 50, 'a balance evaluation stays cheap');

  // A balance slice with more workspaces than the limit starts further along on each 15-minute
  // visit instead of always taking the first ones.
  await db.exec(`
    create table balance_evaluation_log (workspace_id uuid);
    alter function private.evaluate_workspace_spend_rules(uuid, timestamptz, boolean) rename to evaluate_workspace_spend_rules_logged;
    create function private.evaluate_workspace_spend_rules(p_workspace_id uuid, p_now timestamptz, p_blocks boolean default false) returns jsonb language plpgsql as $$
    begin
      insert into public.balance_evaluation_log values (p_workspace_id);
      return private.evaluate_workspace_spend_rules_logged(p_workspace_id, p_now, p_blocks);
    end $$;
  `);
  const visit = (n) => at(26 * 60 + n * 15);
  const slice = (await one(`select (floor(extract(epoch from $1::timestamptz) / 300)::bigint % 12 % 3)::int s`, [visit(0)])).s;
  const inSlice = await count(`public.workspaces w where w.name like 'Perf %' and (pg_catalog.hashtextextended(w.id::text, 0) % 3 + 3) % 3 = $1`, [slice]);
  assert.ok(inSlice >= 20, `the slice has enough workspaces to rotate (${inSlice})`);
  const limit = Math.ceil(inSlice / 4);
  const visits = Math.ceil(inSlice / limit) + 1;
  for (let n = 0; n < visits; n += 1) {
    const result = (await one('select public.sweep_spend_rules($1::timestamptz, $2, false) r', [visit(n), limit])).r;
    assert.ok(result.balance <= limit);
  }
  const reached = await count(`(select distinct l.workspace_id from balance_evaluation_log l join public.workspaces w on w.id = l.workspace_id
    where w.name like 'Perf %' and (pg_catalog.hashtextextended(w.id::text, 0) % 3 + 3) % 3 = $1) r`, [slice]);
  assert.equal(reached, inSlice, 'every workspace in an over-full balance slice is reached within a few visits');
  await db.exec(`
    drop function private.evaluate_workspace_spend_rules(uuid, timestamptz, boolean);
    alter function private.evaluate_workspace_spend_rules_logged(uuid, timestamptz, boolean) rename to evaluate_workspace_spend_rules;
    drop table balance_evaluation_log;
  `);

  console.log('spend-rules-balance: ok');
} finally {
  await db.close();
}
