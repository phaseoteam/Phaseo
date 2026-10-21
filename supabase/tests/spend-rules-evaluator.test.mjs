// Standalone PostgreSQL regression test for the spend rules evaluator: calendar periods in the
// rule's or workspace's time zone (across DST changes), every scope, every v1 base, thresholds
// firing once per period, several thresholds crossed at once, rollover rows, dedupe, disabled /
// deleted / not-yet-supported rules, the dirty-set claim, per-rule destinations, the money push,
// and the sweep's cost over many workspaces. Runs the spend rules schema migration and this
// migration whole on a minimal pre-migration schema.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/spend-rules-evaluator.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
const schemaMigrationName = migrations.find((name) => name.endsWith('_spend_rules_schema.sql'));
const migrationName = migrations.find((name) => name.endsWith('_spend_rules_evaluator.sql'));
assert(schemaMigrationName && migrationName, 'both spend rules migrations exist');
const migration = await read(`../migrations/${migrationName}`);
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();

// ---- The migration carries the schema files, the manifest lists the new ones, CI runs this suite.
const changed = [
  'private/functions/spend_rule_period.sql',
  'private/functions/spend_rule_evaluable.sql',
  'private/functions/evaluate_workspace_spend_rules.sql',
  'public/functions/sweep_spend_rules.sql',
  'public/functions/process_v2_analytics_outbox.sql',
  'public/functions/enqueue_notification_event_deliveries.sql',
  'private/functions/capture_workspace_notification_events.sql',
];
// A function redefined by a later migration (the spend rules API extracts the evaluator's value
// query and text) must match the newest migration that defines it.
const laterMigrations = migrations.filter((name) => name > migrationName);
const newestDefining = async (file) => {
  const signature = `FUNCTION ${file.split("/")[0]}.${file.split("/").pop().replace(/\.sql$/, "")}`;
  let newest = migrationName;
  for (const name of laterMigrations) if ((await read(`../migrations/${name}`)).includes(signature)) newest = name;
  return newest;
};
for (const file of changed) {
  const newest = await newestDefining(file);
  assert(normalize(await read(`../migrations/${newest}`)).includes(normalize(await read(`../schemas/${file}`))), `${file} is in ${newest}`);
}
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of changed.slice(0, 4)) for (const list of ['loadOrder', 'files']) assert(manifest[list].includes(file), `${file} is in the manifest's ${list}`);
assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /, 'the processor replacement is marked as reviewed');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/spend-rules-evaluator\.test\.mjs/, 'CI runs this suite');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const W1 = id(1); // America/New_York billing zone
const W2 = id(2); // Europe/London billing zone
const GONE = id(9); // dirty but deleted
const owner = id(11);
const alice = id(12);
const bob = id(13);
const K1 = id(21); // alice's 'prod', $20 daily cost limit, no department
const K2 = id(22); // bob's 'batch', explicitly in D2, weekly limit 0
const D1 = id(31); // Research: alice's department
const D2 = id(32); // Ops
const destWorkspace = id(41);
const destRule = id(42);
const destPaused = id(43);
const NOW = '2026-10-20 15:07:00+00';

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const sweep = async (now = NOW, limit = 100) => (await one('select public.sweep_spend_rules($1, $2) r', [now, limit])).r;
const usage = (workspace, at, key, actor, model, route, dollars) => db.query(
  `insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, actor_user_id, requests, successful_requests, cost_nanos)
   values ($1, $2, $3, $4, $5, $6, 1, 1, $7)`, [workspace, at, model, route, key, actor, Math.round(dollars * 1e9)]);

try {
  await db.exec(`
    set timezone = 'UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to authenticated, service_role;
    create table auth.users (id uuid primary key, email text);
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
    create table public.notification_destinations (id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade, status text not null default 'active');
    create table public.notification_event_destinations (
      workspace_id uuid not null, event_kind text not null, destination_id uuid not null,
      constraint notification_event_destinations_event_kind_check CHECK ((event_kind = ANY (ARRAY['low_balance'::text, 'auto_top_up_failed'::text, 'payment_method_expiring'::text, 'model_deprecation'::text, 'model_substitution'::text, 'rate_limit_throttled'::text]))),
      primary key (workspace_id, event_kind, destination_id));
    create table public.notification_routed_events (event_id uuid primary key, workspace_id uuid not null, routed_at timestamptz not null default now());
    create table public.notification_delivery_attempts (id uuid primary key default gen_random_uuid(), event_id uuid not null, destination_id uuid not null,
      workspace_id uuid not null, status text not null, unique (event_id, destination_id));
    create table public.email_outbox (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), kind text not null,
      template text not null default 'generic', to_email text not null, subject text, workspace_id uuid, user_id uuid, payload jsonb not null default '{}',
      dedupe_key text unique);
    create table public.workspace_audit_events (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), workspace_id uuid,
      actor_user_id uuid, action text, target_type text, target_id text, target_name text, metadata jsonb);
    create table public.workspace_settings (workspace_id uuid primary key references public.workspaces(id) on delete cascade, department_spend_attribution text not null default 'all');
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
  await db.exec(await read(`../migrations/${schemaMigrationName}`));
  await db.exec(migration);
  // The spend rules API migration redefines the evaluator on shared helpers; run the suite on it.
  const apiMigrationName = laterMigrations.find((name) => name.endsWith('_spend_rules_api.sql'));
  if (apiMigrationName) await db.exec(await read(`../migrations/${apiMigrationName}`));

  // ---- Calendar periods: local midnight to local midnight, Monday weeks, DST-length days.
  const period = async (kind, zone, now) => {
    const row = await one(`select to_char(period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') s, to_char(period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') e
      from private.spend_rule_period($1, $2, $3)`, [kind, zone, now]);
    return row && `${row.s}/${row.e}`;
  };
  assert.equal(await period('day', 'Europe/London', '2026-10-25 23:50+00'), '2026-10-24T23:00Z/2026-10-26T00:00Z', 'London: the day BST ends lasts 25 hours');
  assert.equal(await period('day', 'America/New_York', '2026-11-01 12:00+00'), '2026-11-01T04:00Z/2026-11-02T05:00Z', 'New York: the day EDT ends lasts 25 hours');
  assert.equal(await period('day', 'America/New_York', '2026-03-08 12:00+00'), '2026-03-08T05:00Z/2026-03-09T04:00Z', 'New York: the day EDT starts lasts 23 hours');
  assert.equal(await period('week', 'Europe/London', '2026-10-25 23:50+00'), '2026-10-18T23:00Z/2026-10-26T00:00Z', 'weeks start on Monday, in local time');
  assert.equal(await period('month', 'Asia/Kolkata', '2026-10-20 12:00+00'), '2026-09-30T18:30Z/2026-10-31T18:30Z', 'half-hour zones');
  assert.equal(await period('month', 'Asia/Kathmandu', '2026-10-01 00:00+00'), '2026-09-30T18:15Z/2026-10-31T18:15Z', 'quarter-hour zones, at the edge');
  assert.equal(await period('month', 'UTC', '2026-12-31 23:59+00'), '2026-12-01T00:00Z/2027-01-01T00:00Z');
  assert.equal(await period('rolling', 'UTC', NOW), undefined, 'rolling rules have no calendar period');
  assert.deepEqual((await rows(`select private.spend_rule_evaluable(m, p, b) ok from (values
    ('spend', 'month', null), ('budget_percent', 'day', 'key_limit'), ('budget_percent', 'week', 'previous_period'),
    ('forecast', 'month', null), ('spend', 'rolling', null), ('spike', 'rolling', null), ('balance', 'rolling', null)) v(m, p, b)`)).map((r) => r.ok),
  [true, true, false, false, false, false, false]);

  // ---- Fixture: W1 bills in New York; alice (K1, Research) and bob (K2, explicitly Ops).
  await db.exec(`
    insert into auth.users values ('${owner}', 'owner@example.com'), ('${alice}', 'alice@example.com'), ('${bob}', 'bob@example.com');
    insert into public.workspaces values ('${W1}', 'Acme', '${owner}'), ('${W2}', 'Brit', '${owner}');
    insert into public.workspace_members values ('${W1}', '${owner}', 'owner'), ('${W1}', '${alice}', 'member'), ('${W1}', '${bob}', 'member'), ('${W2}', '${owner}', 'owner');
    insert into public.workspace_settings (workspace_id) values ('${W1}'), ('${W2}');
    update public.workspace_settings set billing_time_zone = 'America/New_York' where workspace_id = '${W1}';
    update public.workspace_settings set billing_time_zone = 'Europe/London' where workspace_id = '${W2}';
    insert into public.workspace_departments values ('${D1}', '${W1}', 'Research'), ('${D2}', '${W1}', 'Ops');
    insert into public.workspace_department_grants (workspace_id, user_id, department_id) values ('${W1}', '${alice}', '${D1}');
    insert into public.keys (id, workspace_id, name, created_by, department_id, daily_limit_cost_nanos) values
      ('${K1}', '${W1}', 'prod', '${alice}', null, 20000000000), ('${K2}', '${W1}', 'batch', '${bob}', '${D2}', 0);
    insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ('${W1}', 'monthly', 50000000000);
    insert into public.v2_models values ('openai/gpt-5', 'GPT-5'), ('anthropic/claude', 'Claude');
    insert into public.v2_model_provider_routes values ('route-gpt', 'openai/gpt-5', 'openai'), ('route-claude', 'anthropic/claude', 'anthropic');
    insert into public.notification_destinations values ('${destWorkspace}', '${W1}', 'active'), ('${destRule}', '${W1}', 'active'), ('${destPaused}', '${W1}', 'paused');
  `);
  await rows(`select public.set_notification_event_destinations($1, 'spend_alert', array[$2]::uuid[])`, [W1, destWorkspace]);
  // Month in New York starts 2026-10-01 04:00Z; today (Oct 20) starts 04:00Z.
  await usage(W1, '2026-10-01 03:45+00', K1, alice, 'openai/gpt-5', 'route-gpt', 50); // September in New York, October in UTC
  await usage(W1, '2026-10-05 10:00+00', K1, alice, 'openai/gpt-5', 'route-gpt', 30);
  await usage(W1, '2026-10-20 03:30+00', K1, alice, 'openai/gpt-5', 'route-gpt', 5); // Oct 19, 23:30 EDT
  await usage(W1, '2026-10-20 05:00+00', K1, alice, 'openai/gpt-5', 'route-gpt', 12);
  await usage(W1, '2026-10-20 06:00+00', K2, bob, 'anthropic/claude', 'route-claude', 8);
  await usage(W1, '2026-10-20 16:00+00', K2, bob, 'anthropic/claude', 'route-claude', 1000); // after now: ignored
  await db.exec(`
    insert into public.gateway_requests (created_at, workspace_id, key_id, endpoint, success, cost_nanos, model_id, provider) values
      ('2026-10-20 07:00+00', '${W1}', '${K2}', 'batch', true, 4000000000, 'anthropic/claude', 'anthropic'),
      ('2026-10-20 07:30+00', '${W1}', '${K2}', 'batch', false, 900000000000, 'anthropic/claude', 'anthropic'),
      ('2026-10-20 07:45+00', '${W1}', '${K2}', 'chat.completions', true, 900000000000, 'anthropic/claude', 'anthropic');
  `);
  // Month (NY): K1 47 (alice, Research, GPT-5, openai); K2 12 (bob, Ops, Claude, anthropic incl. the $4 batch). Today: K1 12, K2 12.

  const rule = async (name, values, workspace = W1) => (await one(
    `insert into public.workspace_spend_rules (workspace_id, name, ${Object.keys(values).join(', ')}) values ($1, $2, ${Object.keys(values).map((_, i) => `$${i + 3}`).join(', ')}) returning id`,
    [workspace, name, ...Object.values(values)])).id;
  const pct = (base, thresholds, extra = {}) => ({ metric: 'budget_percent', period: 'month', base_kind: 'amount', base_amount_nanos: base * 1e9, threshold_percents: `{${thresholds}}`, ...extra });
  const spend = (dollars, extra = {}) => ({ metric: 'spend', period: 'month', threshold_amount_nanos: dollars * 1e9, ...extra });
  const R = {};
  R.ws = await rule('Workspace monthly', pct(100, '50,80,100'));
  R.keySpend = await rule('Prod key today', spend(10, { period: 'day', scope_type: 'key', scope_id: K1 }));
  R.member = await rule('Alice', pct(50, '90', { scope_type: 'member', scope_id: alice }));
  R.dept1 = await rule('Research', spend(40, { scope_type: 'department', scope_id: D1 }));
  R.dept2 = await rule('Ops', spend(20, { scope_type: 'department', scope_id: D2 }));
  R.model = await rule('GPT-5', spend(45, { scope_type: 'model', scope_id: 'openai/gpt-5' }));
  R.provider = await rule('Anthropic', spend(10, { scope_type: 'provider', scope_id: 'anthropic' }));
  R.budget = await rule('Budget', pct(0, '100', { base_kind: 'workspace_budget', base_ref: 'monthly', base_amount_nanos: null }));
  R.keyLimit = await rule('Key limit', pct(0, '50', { period: 'day', base_kind: 'key_limit', base_ref: 'daily', base_amount_nanos: null, scope_type: 'key', scope_id: K1 }));
  R.noLimit = await rule('No weekly limit', pct(0, '50', { period: 'week', base_kind: 'key_limit', base_ref: 'weekly', base_amount_nanos: null, scope_type: 'key', scope_id: K2 }));
  R.utc = await rule('UTC month', spend(55, { time_zone: 'UTC' }));
  R.ny = await rule('NY month', spend(60));
  R.disabled = await rule('Disabled', spend(1, { enabled: false }));
  R.deleted = await rule('Deleted', spend(1));
  await db.query(`update public.workspace_spend_rules set deleted_at = now() where id = $1`, [R.deleted]);
  R.forecast = await rule('Forecast', { metric: 'forecast', period: 'month', threshold_amount_nanos: 1e9 });
  R.rolling = await rule('Rolling', pct(1, '50', { period: 'rolling', window_hours: 24 }));
  R.previous = await rule('Previous', pct(0, '50', { base_kind: 'previous_period', base_amount_nanos: null }));
  const evaluable = ['ws', 'keySpend', 'member', 'dept1', 'dept2', 'model', 'provider', 'budget', 'keyLimit', 'noLimit', 'utc', 'ny'];
  const nameOf = Object.fromEntries(Object.entries(R).map(([name, ruleId]) => [ruleId, name]));
  await db.exec(`insert into public.workspace_spend_rule_destinations (rule_id, destination_id, workspace_id) values
    ('${R.keySpend}', '${destRule}', '${W1}'), ('${R.member}', '${destPaused}', '${W1}')`);

  // The push capture's first call only sets its cursor.
  await one('select private.capture_workspace_notification_events(100) r');

  // ---- First sweep: W1 is dirty; a deleted workspace is dirty too.
  await db.exec(`insert into public.workspace_spend_rule_dirty (workspace_id) values ('${W1}'), ('${GONE}')`);
  const first = await sweep();
  assert.equal(first.dirty, 2, 'both dirty rows are claimed');
  assert.equal(first.evaluated, 1, 'the deleted workspace is skipped');
  assert.equal((await one('select count(*)::int n from public.workspace_spend_rule_dirty')).n, 0, 'claimed rows are deleted');
  const fired = Object.fromEntries(first.events.map((event) => [nameOf[event.rule_id], event]));
  assert.deepEqual(Object.keys(fired).sort(), ['budget', 'dept1', 'keyLimit', 'keySpend', 'member', 'model', 'provider', 'utc', 'ws'].sort(), 'the rules past a threshold fire');
  assert.equal(first.fired, 9);
  assert.equal(first.state_rows, evaluable.length, 'every evaluable rule gets its period row; nothing else does');
  assert.deepEqual(first.blocks, [], 'notify only');
  assert.equal(fired.ws.threshold, 50, 'workspace: $59 of $100 crosses 50%');
  assert.equal(fired.member.threshold, 90, 'member: $47 of $50');
  assert.equal(fired.budget.threshold, 100, 'workspace budget: $59 of the $50 monthly budget');
  assert.equal(fired.keyLimit.threshold, 50, 'key limit: $12 of the $20 daily limit today in New York');
  assert.equal(fired.ws.dedupe_key, `spend_alert:${R.ws}:2026-10-01T04:00:00Z:50`, 'dedupe key: rule, period start (UTC), threshold');
  assert.equal(fired.keySpend.dedupe_key, `spend_alert:${R.keySpend}:2026-10-20T04:00:00Z:amount-10000000000`);
  assert.equal(fired.utc.dedupe_key, `spend_alert:${R.utc}:2026-10-01T00:00:00Z:amount-55000000000`, "a rule's own zone wins over the workspace's");

  const event = async (ruleId) => (await one(`select * from public.email_outbox where payload ->> 'rule_id' = $1 order by created_at desc, dedupe_key desc limit 1`, [ruleId]));
  const wsEvent = await event(R.ws);
  assert.equal(wsEvent.kind, 'spend_alert');
  assert.equal(wsEvent.to_email, 'owner@example.com');
  assert.equal(wsEvent.user_id, owner);
  assert.equal(wsEvent.payload.title, 'Workspace monthly: 50% of $100.00 reached');
  assert.equal(wsEvent.payload.message, 'The workspace has spent $59.00 this month: 59% of $100.00. Alerts at 50%, 80%, 100%. The month resets Nov 1, 00:00 America/New_York.');
  assert.equal(wsEvent.subject, wsEvent.payload.title);
  assert.deepEqual(wsEvent.payload.scope, { type: 'workspace', label: 'Acme' });
  assert.deepEqual(wsEvent.payload.period, { kind: 'month', start: '2026-10-01T04:00:00+00:00', end: '2026-11-01T04:00:00+00:00', time_zone: 'America/New_York' });
  assert.equal(wsEvent.payload.value_nanos, 59e9);
  assert.equal(wsEvent.payload.base_nanos, 100e9);
  assert.equal(wsEvent.payload.percent, 59);
  assert.deepEqual(wsEvent.payload.thresholds_crossed, [50]);
  assert.equal(wsEvent.payload.url, 'https://phaseo.app/settings/notifications');
  assert.deepEqual(wsEvent.payload.push, { title: wsEvent.payload.title, body: wsEvent.payload.message, href: '/settings/notifications', lowerLead: false });
  const keyEvent = await event(R.keySpend);
  assert.equal(keyEvent.payload.title, 'Prod key today: $10.00 reached');
  assert.equal(keyEvent.payload.message, "API key 'prod' has spent $12.00 today, past the $10.00 alert threshold. The day resets Oct 21, 00:00 America/New_York.");
  assert.deepEqual(keyEvent.payload.scope, { type: 'key', id: K1, label: 'prod', key_id: K1 });
  assert.equal((await event(R.member)).payload.scope.label, 'alice@example.com', 'members are named by email');
  assert.equal((await event(R.member)).payload.message.startsWith('alice@example.com has spent $47.00 this month: 94% of $50.00.'), true);
  assert.equal((await event(R.dept1)).payload.message.startsWith("Department 'Research' has spent $47.00 this month"), true, 'departments follow the attribution rule');
  assert.equal((await event(R.model)).payload.scope.label, 'GPT-5', 'models are named from the catalogue');
  assert.equal((await event(R.provider)).payload.value_nanos, 12e9, 'provider spend includes async jobs from gateway_requests');
  assert.equal((await event(R.budget)).payload.title, 'Budget: 100% of the monthly budget reached');
  assert.match((await event(R.budget)).payload.message, /118% of the monthly budget \(\$50\.00\)/);
  assert.equal((await event(R.keyLimit)).payload.title, "Key limit: 50% of the key's daily limit reached");
  assert.equal((await event(R.utc)).payload.value_nanos, 109e9, 'the UTC month includes Oct 1 03:45Z');

  // State: written for the period, firing details on fired rules, nothing for skipped ones.
  const state = async (ruleId) => rows(`select * from public.workspace_spend_rule_state where rule_id = $1 order by period_start`, [ruleId]);
  assert.equal((await state(R.ws))[0].highest_percent_fired, 50);
  assert.equal((await state(R.ws))[0].fire_count, 1);
  assert.equal((await state(R.ws))[0].last_dedupe_key, fired.ws.dedupe_key);
  assert.ok((await state(R.keySpend))[0].amount_fired_at, 'spend rules record when the amount fired');
  const quietRow = (await state(R.dept2))[0];
  assert.equal(quietRow.fire_count, 0, 'a quiet rule gets a rollover row');
  assert.equal(quietRow.highest_percent_fired, null);
  for (const name of ['disabled', 'deleted', 'forecast', 'rolling', 'previous']) assert.equal((await state(R[name])).length, 0, `${name} rules are not evaluated`);

  // ---- Routing: a rule's own destinations replace the workspace routes; paused ones are skipped.
  const route = async (ruleId) => {
    const row = await event(ruleId);
    const count = (await one('select public.enqueue_notification_event_deliveries($1, $2, $3) n', [row.id, W1, 'spend_alert'])).n;
    const destinations = (await rows('select destination_id from public.notification_delivery_attempts where event_id = $1 order by destination_id', [row.id])).map((r) => r.destination_id);
    return { count, destinations };
  };
  assert.deepEqual(await route(R.keySpend), { count: 1, destinations: [destRule] }, 'rule destinations win');
  assert.deepEqual(await route(R.member), { count: 0, destinations: [] }, 'a rule whose only destination is paused sends nowhere (no fallback)');
  assert.deepEqual(await route(R.ws), { count: 1, destinations: [destWorkspace] }, 'other rules use the spend_alert route');

  // ---- Mobile push: each spend alert is a money push; key and member rules reach that person.
  const captured = await one('select private.capture_workspace_notification_events(100) r');
  assert.equal(captured.r.captured, 9);
  const pushes = await rows(`select kind, category, key_id, key_created_by, payload from public.workspace_notification_events where kind = 'spend_alert'`);
  assert.equal(pushes.length, 9);
  assert.ok(pushes.every((push) => push.category === 'money'));
  const pushFor = (ruleId) => pushes.find((push) => push.payload.rule_id === ruleId);
  assert.equal(pushFor(R.keySpend).key_id, K1);
  assert.equal(pushFor(R.keySpend).key_created_by, alice, "the key's creator hears about it");
  assert.equal(pushFor(R.member).key_created_by, alice, 'so does the member of a member rule');
  assert.equal(pushFor(R.ws).key_created_by, null);
  const message = (await one(`select private.workspace_push_message('spend_alert', 'money', $1, false, 'Acme') m`, [JSON.stringify(pushFor(R.ws).payload)])).m;
  assert.equal(message.title, 'Acme: Workspace monthly: 50% of $100.00 reached');
  assert.equal(message.href, '/settings/notifications');

  // ---- Re-evaluating with nothing new: no events, no state writes.
  const stateBefore = await rows('select rule_id, period_start, updated_at, fire_count from public.workspace_spend_rule_state order by 1, 2');
  await db.exec(`insert into public.workspace_spend_rule_dirty (workspace_id) values ('${W1}')`);
  const again = await sweep();
  assert.equal(again.evaluated, 1);
  assert.equal(again.fired, 0, 'each threshold fires once per period');
  assert.equal(again.state_rows, 0, 'state is not written on a quiet evaluation');
  assert.deepEqual(await rows('select rule_id, period_start, updated_at, fire_count from public.workspace_spend_rule_state order by 1, 2'), stateBefore);

  // ---- $45 more crosses 80% and 100% at once: one event naming 100%.
  await usage(W1, '2026-10-20 08:00+00', K2, bob, 'anthropic/claude', 'route-claude', 45);
  await db.exec(`insert into public.workspace_spend_rule_dirty (workspace_id) values ('${W1}')`);
  const jump = await sweep();
  const jumped = Object.fromEntries(jump.events.map((e) => [nameOf[e.rule_id], e]));
  assert.deepEqual(Object.keys(jumped).sort(), ['dept2', 'ny', 'ws'], 'Ops passes $20 and the New York month passes $60');
  assert.equal(jumped.ws.threshold, 100, 'the highest crossed threshold is named');
  assert.equal(jumped.ws.dedupe_key, `spend_alert:${R.ws}:2026-10-01T04:00:00Z:100`);
  const jumpEvent = await one('select payload from public.email_outbox where dedupe_key = $1', [jumped.ws.dedupe_key]);
  assert.deepEqual(jumpEvent.payload.thresholds_crossed, [80, 100], 'both thresholds are listed');
  assert.equal(jumpEvent.payload.title, 'Workspace monthly: 100% of $100.00 reached');
  assert.equal((await state(R.ws))[0].highest_percent_fired, 100);
  assert.equal((await state(R.ws))[0].fire_count, 2);
  assert.equal(jump.state_rows, 3, 'only the rules that fired are written');
  assert.equal((await one(`select count(*)::int n from public.email_outbox where kind = 'spend_alert' and payload ->> 'rule_id' = $1`, [R.ws])).n, 2, 'no 80% event is sent separately');

  // ---- Dedupe: an event already queued for a key is not queued twice, even if state is lost.
  await db.query('delete from public.workspace_spend_rule_state where rule_id = $1', [R.ws]);
  await db.exec(`insert into public.workspace_spend_rule_dirty (workspace_id) values ('${W1}')`);
  const replay = await sweep();
  assert.equal(replay.fired, 0, 'the outbox dedupe key holds');
  assert.equal((await state(R.ws))[0].highest_percent_fired, 100, 'the state row is restored from the evaluation');

  // ---- Rollover: a new day (in New York) brings day rules a new row without traffic or dirt.
  const nextDay = await sweep('2026-10-21 12:00:00+00');
  assert.equal(nextDay.dirty, 0);
  assert.equal(nextDay.rollover, 1, 'W1 is picked up by the rollover pass');
  assert.equal(nextDay.fired, 0, 'no spend yet today');
  assert.equal(nextDay.state_rows, 2, 'the two day rules roll over; month and week rules already have rows');
  assert.equal((await state(R.keySpend)).length, 2);
  assert.equal((await sweep('2026-10-21 12:05:00+00')).rollover, 0, 'rolled over once');
  const nextMonth = await sweep('2026-11-02 12:00:00+00');
  assert.equal(nextMonth.rollover, 1, 'only W1 has rules so far');
  assert.equal((await state(R.ws)).length, 2, 'a new month gets its own row');
  assert.equal((await state(R.ws))[1].fire_count, 0);

  // ---- DST: a London day rule on the 25-hour day BST ends.
  const londonDay = await rule('London today', spend(1, { period: 'day' }), W2);
  const londonWeek = await rule('London week', spend(1000, { period: 'week' }), W2);
  await usage(W2, '2026-10-24 22:45+00', null, owner, 'openai/gpt-5', 'route-gpt', 5); // 23:45 BST on the 24th
  await usage(W2, '2026-10-24 23:15+00', null, owner, 'openai/gpt-5', 'route-gpt', 0.5); // 00:15 BST on the 25th
  await usage(W2, '2026-10-25 23:30+00', null, owner, 'openai/gpt-5', 'route-gpt', 0.6); // 23:30 GMT on the 25th
  await db.exec(`insert into public.workspace_spend_rule_dirty (workspace_id) values ('${W2}')`);
  const london = await sweep('2026-10-25 23:50:00+00');
  assert.equal(london.events.length, 1);
  assert.equal(london.events[0].rule_id, londonDay);
  const londonEvent = await one('select payload from public.email_outbox where dedupe_key = $1', [london.events[0].dedupe_key]);
  assert.equal(londonEvent.payload.value_nanos, 1.1e9, 'only the local day counts');
  assert.equal(londonEvent.payload.message, 'The workspace has spent $1.10 today, past the $1.00 alert threshold. The day resets Oct 26, 00:00 Europe/London.');
  const londonRow = (await state(londonDay))[0];
  assert.equal((new Date(londonRow.period_end) - new Date(londonRow.period_start)) / 3600e3, 25, 'the stored period is 25 hours long');
  assert.equal(new Date((await state(londonWeek))[0].period_start).toISOString(), '2026-10-18T23:00:00.000Z', 'the week started Monday 00:00 BST');

  // ---- Disabling or deleting a rule stops it at once.
  await db.query('update public.workspace_spend_rules set enabled = false where id = $1', [londonDay]);
  await usage(W2, '2026-10-26 01:00+00', null, owner, 'openai/gpt-5', 'route-gpt', 5);
  await db.exec(`insert into public.workspace_spend_rule_dirty (workspace_id) values ('${W2}')`);
  assert.equal((await sweep('2026-10-26 02:00:00+00')).fired, 0, 'disabled rules do not fire');

  // ---- The claim skips rows another sweep holds, and only one sweep runs at a time.
  assert.equal((await sweep(NOW, 1)).dirty, 0);
  await assert.rejects(sweep(NOW, 0), /invalid_spend_rule_sweep_limit/);
  await assert.rejects(db.query('select public.sweep_spend_rules(null, 10)'), /invalid_spend_rule_sweep_time/);
  await db.exec(`insert into public.workspace_spend_rule_dirty (workspace_id, dirtied_at) values ('${W2}', now() - interval '1 minute'), ('${W1}', now())`);
  const claimed = await sweep(NOW, 1);
  assert.equal(claimed.dirty, 1, 'p_limit bounds the claim');
  assert.deepEqual((await rows('select workspace_id from public.workspace_spend_rule_dirty')).map((r) => r.workspace_id), [W1], 'the oldest mark is claimed first');
  await sweep(NOW, 1);

  // ---- Grants: service role only.
  for (const signature of ['public.sweep_spend_rules(timestamp with time zone, integer)']) {
    assert.equal((await one(`select has_function_privilege('authenticated', '${signature}', 'execute') ok`)).ok, false);
    assert.equal((await one(`select has_function_privilege('anon', '${signature}', 'execute') ok`)).ok, false);
    assert.equal((await one(`select has_function_privilege('service_role', '${signature}', 'execute') ok`)).ok, true);
  }
  assert.equal((await one(`select has_function_privilege('authenticated', 'private.evaluate_workspace_spend_rules(uuid, timestamp with time zone)', 'execute') ok`)).ok, false);

  // ---- Cost: 300 workspaces with a month of hourly usage on two keys and three rules each.
  const many = 300;
  await db.exec(`
    insert into auth.users select ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid, 'perf' || n || '@example.com' from generate_series(1, ${many}) n;
    insert into public.workspaces select ('00000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid, 'Perf ' || n, ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid from generate_series(1, ${many}) n;
    insert into public.workspace_members select w.id, w.owner_user_id, 'owner' from public.workspaces w where w.name like 'Perf %';
    insert into public.workspace_settings (workspace_id, billing_time_zone) select id, 'Europe/Berlin' from public.workspaces where name like 'Perf %';
    insert into public.keys (id, workspace_id, name, created_by)
      select md5(w.id::text || k)::uuid, w.id, 'key ' || k, w.owner_user_id from public.workspaces w cross join generate_series(1, 2) k where w.name like 'Perf %';
    insert into public.workspace_departments select md5('d' || w.id::text)::uuid, w.id, 'Dept' from public.workspaces w where w.name like 'Perf %';
    insert into public.workspace_department_grants (workspace_id, user_id, department_id) select w.id, w.owner_user_id, md5('d' || w.id::text)::uuid from public.workspaces w where w.name like 'Perf %';
    insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, actor_user_id, requests, successful_requests, cost_nanos)
      select w.id, timestamptz '2026-10-01 00:00+00' + make_interval(hours => h), 'openai/gpt-5', 'route-gpt', md5(w.id::text || k)::uuid, w.owner_user_id, 1, 1, 10000000
      from public.workspaces w cross join generate_series(0, 470) h cross join generate_series(1, 2) k where w.name like 'Perf %';
    insert into public.workspace_spend_rules (workspace_id, name, metric, period, base_kind, base_amount_nanos, threshold_percents)
      select id, 'Monthly', 'budget_percent', 'month', 'amount', 100000000000, '{50,80,100}' from public.workspaces where name like 'Perf %';
    insert into public.workspace_spend_rules (workspace_id, name, metric, period, threshold_amount_nanos, scope_type, scope_id)
      select w.id, 'Key today', 'spend', 'day', 100000000, 'key', md5(w.id::text || 1)::uuid::text from public.workspaces w where w.name like 'Perf %';
    insert into public.workspace_spend_rules (workspace_id, name, metric, period, threshold_amount_nanos, scope_type, scope_id)
      select w.id, 'Dept', 'spend', 'month', 5000000000, 'department', md5('d' || w.id::text)::uuid::text from public.workspaces w where w.name like 'Perf %';
    insert into public.workspace_spend_rule_dirty (workspace_id) select id from public.workspaces where name like 'Perf %';
    analyze;
  `);
  const perfNow = '2026-10-20 15:07:00+00';
  let started = performance.now();
  const cold = await sweep(perfNow, 1000);
  const coldMs = performance.now() - started;
  assert.equal(cold.dirty, many);
  assert.equal(cold.evaluated, many + cold.rollover + cold.periodic, 'every claimed workspace is evaluated, plus the rollover and periodic passes');
  assert.equal(cold.events.filter((e) => e.workspace_id !== W1 && e.workspace_id !== W2).length, many * 2, 'the department ($9.42 this month) and key-today ($0.17 today in Berlin) rules fire; $9.42 of $100 crosses nothing');
  await db.exec(`insert into public.workspace_spend_rule_dirty (workspace_id) select id from public.workspaces where name like 'Perf %'`);
  started = performance.now();
  const warm = await sweep(perfNow, 1000);
  const warmMs = performance.now() - started;
  assert.equal(warm.fired, 0);
  assert.equal(warm.state_rows, 0);
  const perWorkspace = warmMs / many;
  console.log(JSON.stringify({ sweep: { workspaces: many, usage_rows_per_workspace: 471 * 2, rules_per_workspace: 3, first_ms: Math.round(coldMs), first_ms_per_workspace: +(coldMs / many).toFixed(2), quiet_ms: Math.round(warmMs), quiet_ms_per_workspace: +perWorkspace.toFixed(2) } }));
  assert.ok(perWorkspace < 50, `a quiet evaluation stays cheap (${perWorkspace.toFixed(2)} ms per workspace)`);

  // The periodic pass covers every workspace with rules once over twelve 5-minute calls.
  const withRules = (await one(`select count(distinct workspace_id)::int n from public.workspace_spend_rules
    where enabled and deleted_at is null and private.spend_rule_evaluable(metric, period, base_kind)`)).n;
  let periodicTotal = 0;
  for (let slot = 0; slot < 12; slot += 1) {
    const result = await sweep(new Date(Date.parse('2026-10-20T15:10:00Z') + slot * 300e3).toISOString(), 1000);
    assert.equal(result.rollover, 0);
    assert.equal(result.fired, 0);
    periodicTotal += result.periodic;
  }
  assert.equal(periodicTotal, withRules, 'each workspace with rules is evaluated once an hour');

  // One workspace with 50 rules over every scope.
  const big = (await one(`select id from public.workspaces where name = 'Perf 1'`)).id;
  const bigKey = (await one(`select id from public.keys where workspace_id = $1 order by name limit 1`, [big])).id;
  await db.query(`insert into public.workspace_spend_rules (workspace_id, name, metric, period, threshold_amount_nanos, scope_type, scope_id, time_zone)
    select $1, 'Rule ' || n, 'spend', (array['day','week','month'])[n % 3 + 1], 1000000000000 + n, (array['workspace','key','model','provider'])[n % 4 + 1],
      case n % 4 when 0 then null when 1 then $2::text when 2 then 'openai/gpt-5' else 'openai' end,
      (array['UTC','Asia/Kolkata','America/Los_Angeles', null])[n % 4 + 1]
    from generate_series(1, 47) n`, [big, bigKey]);
  await one('select private.evaluate_workspace_spend_rules($1, $2) r', [big, perfNow]);
  started = performance.now();
  const bigResult = (await one('select private.evaluate_workspace_spend_rules($1, $2) r', [big, perfNow])).r;
  const bigMs = performance.now() - started;
  assert.equal(bigResult.rules, 50);
  console.log(JSON.stringify({ fifty_rules_ms: +bigMs.toFixed(2) }));

  console.log('spend rules evaluator: ok');
} finally {
  await db.close();
}
