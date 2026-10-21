// Standalone PostgreSQL regression test for forecast spend rules, previous-period bases and
// rolling windows.
// Forecast: the usage dashboard's straight-line projection to the period end (checked against the
// fixture the dashboard's own helpers are tested on, apps/web/src/lib/gateway/usage/__fixtures__/
// spend-forecast-parity.json), ready 3/24/72 hours into a day/week/month, in any time zone; each
// threshold once per period, by amount or by percent of a base; at least a cent spent first.
// previous_period: the same point in the previous period on the local wall clock (the dashboard's
// calendar comparison), the window before a rolling one, the whole previous period for a forecast.
// Rolling windows: spend and budget_percent over the last window_hours, with cooldown_minutes
// between alerts (state row '-infinity'), and rolling block rules (no reset, lift below the limit).
// Runs the spend rules migrations whole on a minimal pre-migration schema, and prints the
// evaluator's cost per workspace.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/spend-rules-forecast.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
const find = (suffix) => migrations.find((name) => name.endsWith(suffix));
const stack = ['_spend_rules_schema.sql', '_spend_rules_evaluator.sql', '_spend_rules_api.sql', '_spend_rule_blocks.sql',
  '_spend_rules_balance.sql', '_spend_rules_forecast.sql'].map(find);
assert(stack.every(Boolean), 'the spend rules migrations exist');
const migrationName = stack[5];
assert(migrationName > stack[4], 'the forecast migration runs after the balance migration');
const migration = await read(`../migrations/${migrationName}`);
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const fixture = JSON.parse(await read('../../apps/web/src/lib/gateway/usage/__fixtures__/spend-forecast-parity.json'));

// ---- The migration carries the schema files, CI runs this suite.
const redefined = [
  'private/functions/spend_rule_evaluable.sql',
  'private/functions/spend_rule_values.sql',
  'private/functions/spend_rule_alert_text.sql',
  'private/functions/evaluate_workspace_spend_rules.sql',
  'public/functions/preview_workspace_spend_rule.sql',
];
const laterMigrations = migrations.filter((name) => name > migrationName);
for (const file of redefined) {
  const signature = `FUNCTION ${file.split('/')[0]}.${file.split('/').pop().replace(/\.sql$/, '')}`;
  let newest = migration;
  for (const name of laterMigrations) {
    const sql = await read(`../migrations/${name}`);
    if (sql.includes(signature)) newest = sql;
  }
  assert(normalize(newest).includes(normalize(await read(`../schemas/${file}`))), `${file} is in the newest migration that defines it`);
}
assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /, 'the function drops are marked as reviewed');
assert.match(migration, /DROP FUNCTION IF EXISTS "private"\."spend_rule_values"\(uuid, timestamp with time zone, uuid\);/);
assert.match(migration, /DROP FUNCTION IF EXISTS "private"\."spend_rule_alert_text"\(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer\[\], bigint, numeric, integer\);/);
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/spend-rules-forecast\.test\.mjs/, 'CI runs this suite');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(11);
const ada = id(12);
const DOLLAR = 1e9;
const nanos = (dollars) => Math.round(dollars * DOLLAR);
let nextWorkspace = 100;

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const ms = (value) => (value === null || value === undefined ? null : new Date(value).toISOString());

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

  // ---- One definition of each function, service role only.
  const functions = ['spend_rule_evaluable', 'spend_rule_values', 'spend_rule_alert_text', 'evaluate_workspace_spend_rules', 'preview_workspace_spend_rule'];
  const grants = await rows(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') authenticated, has_function_privilege('service_role', p.oid, 'execute') service
    from pg_proc p where p.proname = any($1)`, [functions]);
  assert.equal(grants.length, functions.length, 'one definition of each (the old signatures are dropped)');
  for (const grant of grants) {
    assert.equal(grant.anon, false, `${grant.proname}: anon`);
    assert.equal(grant.authenticated, false, `${grant.proname}: authenticated`);
    assert.equal(grant.service, true, `${grant.proname}: service_role`);
  }
  assert.deepEqual((await rows(`select private.spend_rule_evaluable(m, p, b) ok from (values
    ('forecast', 'month', null), ('forecast', 'day', 'previous_period'), ('forecast', 'week', 'key_limit'), ('budget_percent', 'month', 'previous_period'),
    ('spend', 'rolling', null), ('budget_percent', 'rolling', 'amount'), ('budget_percent', 'rolling', 'previous_period'),
    ('balance', 'rolling', null), ('spike', 'rolling', null), ('forecast', 'rolling', null)) v(m, p, b)`)).map((r) => r.ok),
  [true, true, true, true, true, true, true, true, false, false], 'forecast, previous_period and rolling windows are evaluated; spike is not yet');

  await db.exec(`
    insert into auth.users values ('${owner}', 'owner@example.com', '{}'), ('${ada}', 'ada@example.com', '{}');
    insert into public.v2_models values ('openai/gpt-5', 'GPT-5');
    insert into public.v2_model_provider_routes values ('route-gpt', 'openai/gpt-5', 'openai');
  `);
  const workspace = async (name = 'Acme', billingZone = null) => {
    const ws = id(nextWorkspace++);
    const key = id(nextWorkspace++);
    await db.query('insert into public.workspaces values ($1, $2, $3)', [ws, name, owner]);
    await db.query(`insert into public.workspace_members values ($1, $2, 'owner')`, [ws, owner]);
    await db.query('insert into public.workspace_settings (workspace_id) values ($1)', [ws]);
    if (billingZone) await db.query('update public.workspace_settings set billing_time_zone = $2 where workspace_id = $1', [ws, billingZone]);
    await db.query(`insert into public.keys (id, workspace_id, name, created_by) values ($1, $2, 'prod', $3)`, [key, ws, owner]);
    return { ws, key };
  };
  const addUsage = async ({ ws, key }, costNanos, bucket) => db.query(`insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, actor_user_id, requests, successful_requests, cost_nanos)
      values ($1, $2, 'openai/gpt-5', 'route-gpt', $3, $4, 1, 1, $5)
      on conflict (workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok, actor_user_id)
      do update set cost_nanos = public.v2_private_usage_15m.cost_nanos + excluded.cost_nanos`, [ws, bucket, key, owner, costNanos]);
  const rule = async ({ ws }, values) => (await one(
    `insert into public.workspace_spend_rules (workspace_id, ${Object.keys(values).join(', ')})
     values ($1, ${Object.keys(values).map((_, i) => `$${i + 2}`).join(', ')}) returning id`,
    [ws, ...Object.values(values)])).id;
  const values = async ({ ws }, now, ruleId = null) => rows('select * from private.spend_rule_values($1, $2::timestamptz, $3)', [ws, now, ruleId]);
  const evaluate = async ({ ws }, now, blocks = false) => (await one('select private.evaluate_workspace_spend_rules($1, $2::timestamptz, $3) r', [ws, now, blocks])).r;
  const preview = async ({ ws }, ruleId, now) => (await one('select public.preview_workspace_spend_rule($1, $2, $3::timestamptz) p', [ws, ruleId, now])).p;
  const alerts = async (ruleId) => rows(`select payload, dedupe_key, subject from public.email_outbox
    where kind = 'spend_alert' and payload ->> 'rule_id' = $1 order by created_at, dedupe_key`, [ruleId]);
  const states = async (ruleId) => rows(`select period_start::text period_start, period_end, highest_percent_fired, amount_fired_at, last_fired_at, fire_count
    from public.workspace_spend_rule_state where rule_id = $1 order by period_start`, [ruleId]);

  // ---- Parity with the dashboard's forecast on the shared fixture, in UTC and other zones.
  for (const item of fixture.forecast) {
    const w = await workspace();
    for (const usage of item.usage) await addUsage(w, usage.nanos, usage.at);
    const ruleId = await rule(w, { name: item.name.slice(0, 100), metric: 'forecast', period: item.period, time_zone: item.timeZone, threshold_amount_nanos: item.limitNanos });
    const [row] = await values(w, item.now);
    assert.equal(row.id, ruleId, item.name);
    assert.equal(ms(row.period_start), item.start, `${item.name}: period start`);
    assert.equal(ms(row.period_end), item.end, `${item.name}: period end`);
    assert.equal(Number(row.value_nanos), item.expected.usedNanos, `${item.name}: spend so far`);
    assert.equal(ms(row.forecast_from), item.expected.forecastFrom, `${item.name}: projection start`);
    assert.equal(Number(row.limit_nanos), item.limitNanos, `${item.name}: limit`);
    if (item.expected.projectedNanos === null) assert.equal(row.projected_nanos, null, `${item.name}: not ready`);
    else assert(Math.abs(Number(row.projected_nanos) - item.expected.projectedNanos) <= 1, `${item.name}: projected ${row.projected_nanos} vs ${item.expected.projectedNanos}`);
    assert.equal(ms(row.reaches_at), item.expected.reachesLimitAt, `${item.name}: reaches the limit`);
    const shown = await preview(w, ruleId, item.now);
    assert.equal(shown.forecast.ready, item.expected.ready, `${item.name}: preview ready`);
    assert.equal(ms(shown.forecast.reaches_at), item.expected.reachesLimitAt, `${item.name}: preview date`);
  }
  for (const item of fixture.previous) {
    const w = await workspace();
    await rule(w, { name: 'Previous', metric: 'budget_percent', period: item.period, time_zone: item.timeZone, base_kind: 'previous_period', threshold_percents: [100] });
    const [row] = await values(w, item.now);
    assert.equal(ms(row.period_start), item.start, `${item.name}: period start`);
    assert.equal(ms(row.previous_start), item.expected.from, `${item.name}: previous start`);
    assert.equal(ms(row.previous_end), item.expected.to, `${item.name}: previous end`);
  }

  // ---- Forecast by amount, in a non-UTC zone (the workspace's billing time zone).
  {
    const w = await workspace('Acme', 'America/New_York');
    const F1 = await rule(w, { name: 'Month forecast', metric: 'forecast', period: 'month', threshold_amount_nanos: nanos(500) });
    // October in New York starts 04:00 UTC. $30 on the 1st.
    await addUsage(w, nanos(30), '2026-10-01T12:00:00Z');
    let result = await evaluate(w, '2026-10-03T12:00:00Z');
    assert.equal(result.rules, 1);
    assert.equal(result.fired, 0, 'too early in the month to project (72 hours)');
    assert.equal(result.state_rows, 1, 'the rollover row is written');
    let shown = await preview(w, F1, '2026-10-03T12:00:00Z');
    assert.equal(shown.evaluated, true);
    assert.equal(shown.forecast.ready, false);
    assert.equal(ms(shown.forecast.from), '2026-10-04T04:00:00.000Z');
    assert.equal(shown.forecast.projected_nanos, null);
    assert.equal(shown.alert, null, 'no alert text until the projection is ready');
    assert.equal(Number(shown.next_threshold.amount_nanos), nanos(500));

    // Oct 11 04:00 UTC: 10 of 31 days; $150 so far projects $465, under $500.
    await addUsage(w, nanos(120), '2026-10-09T15:00:00Z');
    result = await evaluate(w, '2026-10-11T04:00:00Z');
    assert.equal(result.fired, 0, '$465 projected is under $500');
    assert.equal(result.state_rows, 0, 'a quiet re-evaluation writes nothing');
    shown = await preview(w, F1, '2026-10-11T04:00:00Z');
    assert.equal(Number(shown.forecast.projected_nanos), nanos(465));
    assert.equal(shown.forecast.reaches_at, null);

    // $200 so far projects $620: past $500, which the pace reaches 25 days in (Oct 26, 00:00 local).
    await addUsage(w, nanos(50), '2026-10-10T20:00:00Z');
    result = await evaluate(w, '2026-10-11T04:00:00Z');
    assert.equal(result.fired, 1, 'projected past $500');
    const [alert] = await alerts(F1);
    assert.equal(alert.dedupe_key, `spend_alert:${F1}:2026-10-01T04:00:00Z:projected-amount-${nanos(500)}`);
    assert.equal(alert.subject, 'Month forecast: projected to reach $620.00 this month');
    assert.equal(alert.payload.message, 'The workspace has spent $200.00 this month and is projected to reach $620.00 by Nov 1, 00:00 America/New_York, past the $500.00 alert threshold. At this pace it reaches $500.00 on Oct 26, 00:00.');
    assert.equal(alert.payload.metric, 'forecast');
    assert.equal(Number(alert.payload.forecast.projected_nanos), nanos(620));
    assert.equal(ms(alert.payload.forecast.reaches_at), '2026-10-26T04:00:00.000Z');
    assert.equal(ms(alert.payload.forecast.by), '2026-11-01T04:00:00.000Z');
    assert.equal(result.events[0].threshold, nanos(500));
    const [row] = await states(F1);
    assert(row.amount_fired_at, 'amount_fired_at records the forecast alert');
    result = await evaluate(w, '2026-10-20T04:00:00Z');
    assert.equal(result.fired, 0, 'each threshold once per period');

    // November: a new period, projected again from its own start.
    await addUsage(w, nanos(80), '2026-11-02T10:00:00Z');
    result = await evaluate(w, '2026-11-05T05:00:00Z');
    assert.equal(result.fired, 1, '$80 in 97 hours of a 721-hour November projects about $595');
    assert.equal((await alerts(F1)).length, 2);
    assert.equal((await states(F1)).length, 2, 'one state row per period');

    // Already past the threshold: the text says so instead of dating it.
    await addUsage(w, nanos(900), '2026-11-06T10:00:00Z');
    shown = await preview(w, F1, '2026-11-08T05:00:00Z');
    assert.match(shown.alert.message, /It has already passed \$500\.00\.$/);
  }

  // ---- The cent floor: a projection from under a cent never fires.
  {
    const w = await workspace();
    const F2 = await rule(w, { name: 'Tiny', metric: 'forecast', period: 'month', threshold_amount_nanos: nanos(0.05) });
    await addUsage(w, nanos(0.009), '2026-10-01T01:00:00Z');
    const result = await evaluate(w, '2026-10-04T00:00:00Z');
    const [row] = await values(w, '2026-10-04T00:00:00Z');
    assert(Number(row.projected_nanos) > nanos(0.05), 'projected past the threshold');
    assert.equal(result.fired, 0, 'but under a cent spent: no alert');
    await addUsage(w, nanos(0.002), '2026-10-03T01:00:00Z');
    assert.equal((await evaluate(w, '2026-10-04T00:00:00Z')).fired, 1, 'a cent spent: the forecast fires');
    void F2;
  }

  // ---- Forecast by percent of a workspace budget, in Asia/Kolkata (a day rule).
  {
    const w = await workspace();
    await db.query(`insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ($1, 'daily', $2)`, [w.ws, nanos(20)]);
    const F3 = await rule(w, { name: 'Day budget forecast', metric: 'forecast', period: 'day', time_zone: 'Asia/Kolkata',
      base_kind: 'workspace_budget', base_ref: 'daily', threshold_percents: [80, 100] });
    // The Kolkata day of Oct 21 starts Oct 20 18:30 UTC. $4 by 00:30 UTC (6 hours) projects $16 = 80%.
    await addUsage(w, nanos(4), '2026-10-20T20:00:00Z');
    let result = await evaluate(w, '2026-10-21T00:30:00Z');
    assert.equal(result.fired, 1);
    let [alert] = await alerts(F3);
    assert.equal(alert.dedupe_key, `spend_alert:${F3}:2026-10-20T18:30:00Z:projected-80`);
    assert.equal(alert.subject, 'Day budget forecast: projected to pass 80% of the daily budget');
    assert.equal(alert.payload.message, 'The workspace has spent $4.00 today and is projected to reach $16.00 by Oct 22, 00:00 Asia/Kolkata: 80% of the daily budget ($20.00). Alerts at 80%, 100%.');
    assert.deepEqual(alert.payload.thresholds_crossed, [80]);
    assert.equal(Number(alert.payload.forecast.projected_percent), 80);
    // $6 by 00:30 projects $24 = 120%: the 100% forecast, dated.
    await addUsage(w, nanos(2), '2026-10-20T23:00:00Z');
    result = await evaluate(w, '2026-10-21T00:30:00Z');
    assert.equal(result.fired, 1);
    alert = (await alerts(F3))[1];
    assert.equal(alert.payload.threshold_percent, 100);
    assert.match(alert.payload.message, /: 120% of the daily budget \(\$20\.00\)\. Alerts at 80%, 100%\. At this pace it reaches the daily budget \(\$20\.00\) on Oct 21, 20:00\.$/);
    assert.equal((await evaluate(w, '2026-10-21T01:30:00Z')).fired, 0);
    const shown = await preview(w, F3, '2026-10-21T00:30:00Z');
    assert.equal(shown.reached_threshold_percent, 100, 'preview thresholds measure the projection');
    assert.equal(shown.next_threshold, null);
  }

  // ---- Forecast against the whole previous period (previous_period base).
  {
    const w = await workspace();
    const F4 = await rule(w, { name: 'Week vs last week', metric: 'forecast', period: 'week', base_kind: 'previous_period', threshold_percents: [150] });
    await addUsage(w, nanos(40), '2026-10-13T10:00:00Z'); // last week: $100 in total
    await addUsage(w, nanos(60), '2026-10-18T22:00:00Z');
    await addUsage(w, nanos(30), '2026-10-19T09:00:00Z'); // this week, Monday
    let [row] = await values(w, '2026-10-21T00:00:00Z');
    assert.equal(Number(row.base_nanos), nanos(100), 'the base is the whole previous week');
    assert.equal(ms(row.previous_start), '2026-10-12T00:00:00.000Z');
    assert.equal(ms(row.previous_end), '2026-10-19T00:00:00.000Z');
    assert.equal(Number(row.projected_nanos), nanos(105), '$30 in 2 days projects $105');
    assert.equal((await evaluate(w, '2026-10-21T00:00:00Z')).fired, 0, '105% of last week');
    await addUsage(w, nanos(20), '2026-10-20T09:00:00Z');
    assert.equal((await evaluate(w, '2026-10-21T00:00:00Z')).fired, 1, '$50 in 2 days projects $175: past 150%');
    const [alert] = await alerts(F4);
    assert.match(alert.payload.message, /: 175% of last week's total \(\$100\.00\)\. Alerts at 150%\. At this pace it reaches last week's total \(\$100\.00\) on Oct 23, 00:00\.$/);
    assert.equal(ms(alert.payload.previous_period.start), '2026-10-12T00:00:00.000Z');
  }

  // ---- budget_percent against the same point in the previous period, in Europe/London.
  {
    const w = await workspace();
    const P1 = await rule(w, { name: 'Today vs yesterday', metric: 'budget_percent', period: 'day', time_zone: 'Europe/London',
      base_kind: 'previous_period', threshold_percents: [200] });
    // Monday Oct 26 (GMT) until 09:12 compares with Sunday Oct 25 (from 00:00 BST = Oct 24 23:00 UTC) until 09:12 GMT.
    await addUsage(w, nanos(7), '2026-10-24T22:45:00Z'); // Saturday: outside
    await addUsage(w, nanos(5), '2026-10-24T23:00:00Z'); // Sunday 00:00 BST
    await addUsage(w, nanos(5), '2026-10-25T09:00:00Z'); // Sunday before 09:12
    await addUsage(w, nanos(50), '2026-10-25T09:15:00Z'); // Sunday after the same point: outside
    await addUsage(w, nanos(15), '2026-10-26T08:00:00Z');
    let [row] = await values(w, '2026-10-26T09:12:00Z');
    assert.equal(Number(row.base_nanos), nanos(10), 'yesterday until the same time');
    assert.equal(Number(row.value_nanos), nanos(15));
    assert.equal((await evaluate(w, '2026-10-26T09:12:00Z')).fired, 0, '150% of yesterday at this time');
    await addUsage(w, nanos(5), '2026-10-26T09:00:00Z');
    assert.equal((await evaluate(w, '2026-10-26T09:12:00Z')).fired, 1, '200%');
    const [alert] = await alerts(P1);
    assert.equal(alert.subject, 'Today vs yesterday: 200% of yesterday at this time reached');
    assert.match(alert.payload.message, /^The workspace has spent \$20\.00 today: 200% of yesterday at this time \(\$10\.00\)\. Alerts at 200%\. The day resets Oct 27, 00:00 Europe\/London\.$/);
    const shown = await preview(w, P1, '2026-10-26T09:12:00Z');
    assert.equal(ms(shown.previous_period.end), '2026-10-25T09:12:00.000Z');

    // No spend in the previous period: no base, nothing fires.
    const w2 = await workspace();
    await rule(w2, { name: 'No history', metric: 'budget_percent', period: 'month', base_kind: 'previous_period', threshold_percents: [50] });
    await addUsage(w2, nanos(500), '2026-10-02T00:00:00Z');
    [row] = await values(w2, '2026-10-20T00:00:00Z');
    assert.equal(row.base_nanos, null);
    assert.equal((await evaluate(w2, '2026-10-20T00:00:00Z')).fired, 0);
  }

  // ---- Rolling spend: last 24 hours, cooldown between alerts, no rollover rows.
  {
    const w = await workspace();
    const R1 = await rule(w, { name: 'Daily burn', metric: 'spend', period: 'rolling', window_hours: 24, threshold_amount_nanos: nanos(10), cooldown_minutes: 60 });
    await addUsage(w, nanos(8), '2026-10-20T01:00:00Z'); // falls out of the window by 2026-10-21T01:15
    await addUsage(w, nanos(4), '2026-10-20T20:00:00Z');
    let result = await evaluate(w, '2026-10-20T22:00:00Z');
    assert.equal(result.fired, 1, '$12 in the last 24 hours');
    const [alert] = await alerts(R1);
    const bucket = Math.floor(Date.parse('2026-10-20T22:00:00Z') / 1000 / 3600);
    assert.equal(alert.dedupe_key, `spend_alert:${R1}:cooldown:${bucket}:amount-${nanos(10)}`);
    assert.equal(alert.subject, 'Daily burn: $10.00 reached');
    assert.equal(alert.payload.message, 'The workspace has spent $12.00 in the last 24 hours, past the $10.00 alert threshold.');
    assert.equal(alert.payload.period.kind, 'rolling');
    assert.equal(alert.payload.period.window_hours, 24);
    assert.equal(alert.payload.cooldown_minutes, 60);
    let [row] = await states(R1);
    assert.equal(row.period_start, '-infinity', "the rolling rule's state is the '-infinity' row");
    assert.equal(row.period_end, null);
    assert.equal((await evaluate(w, '2026-10-20T22:30:00Z')).fired, 0, 'within the cooldown');
    result = await evaluate(w, '2026-10-20T23:01:00Z');
    assert.equal(result.fired, 1, 'still over once the cooldown ends: alerts again');
    assert.equal((await states(R1))[0].fire_count, 2);
    result = await evaluate(w, '2026-10-21T02:30:00Z');
    assert.equal(result.fired, 0, 'the $8 left the window: $4');
    assert.equal(result.state_rows, 0, 'rolling rules get no rollover rows');
    const shown = await preview(w, R1, '2026-10-21T02:30:00Z');
    assert.equal(shown.evaluated, true);
    assert.equal(shown.period.kind, 'rolling');
    assert.equal(shown.period.window_hours, 24);
    assert.equal(ms(shown.period.start), '2026-10-20T02:30:00.000Z');
    assert.equal(Number(shown.value_nanos), nanos(4));
    assert.equal(shown.state.fire_count, 2);
  }

  // ---- Rolling budget_percent: a higher threshold within the cooldown, the same one after it.
  {
    const w = await workspace();
    const R2 = await rule(w, { name: 'Hourly', metric: 'budget_percent', period: 'rolling', window_hours: 1, base_kind: 'amount',
      base_amount_nanos: nanos(10), threshold_percents: [50, 100], cooldown_minutes: 120 });
    await addUsage(w, nanos(6), '2026-10-21T10:15:00Z');
    assert.equal((await evaluate(w, '2026-10-21T10:30:00Z')).fired, 1, '60%');
    await addUsage(w, nanos(5), '2026-10-21T10:30:00Z');
    assert.equal((await evaluate(w, '2026-10-21T10:45:00Z')).fired, 1, '110%: the higher threshold fires within the cooldown');
    assert.equal((await evaluate(w, '2026-10-21T11:00:00Z')).fired, 0, 'nothing new within the cooldown');
    await addUsage(w, nanos(11), '2026-10-21T12:30:00Z');
    assert.equal((await evaluate(w, '2026-10-21T12:50:00Z')).fired, 1, 'after the cooldown, 110% again');
    const sent = await alerts(R2);
    assert.deepEqual(sent.map((item) => item.payload.threshold_percent), [50, 100, 100]);
    assert.equal(sent[0].payload.message, 'The workspace has spent $6.00 in the last hour: 60% of $10.00. Alerts at 50%, 100%.');
    assert.equal((await states(R2))[0].highest_percent_fired, 100);

    // Rolling, against the window before.
    const R3 = await rule(w, { name: 'Vs the hour before', metric: 'budget_percent', period: 'rolling', window_hours: 1,
      base_kind: 'previous_period', threshold_percents: [150] });
    const [row] = await values(w, '2026-10-21T10:45:00Z', R3);
    assert.equal(ms(row.previous_start), '2026-10-21T08:45:00.000Z');
    assert.equal(ms(row.previous_end), '2026-10-21T09:45:00.000Z');
  }

  // ---- Rolling block rules: no reset; lift once the window is under the limit.
  {
    const w = await workspace();
    // p_now must be current for a block to start, and later than the rule's creation.
    const now = new Date(Math.ceil(Date.now() / 60_000) * 60_000 + 60_000).toISOString();
    const minus = (minutes) => new Date(Date.parse(now) - minutes * 60_000).toISOString();
    const plus = (minutes) => new Date(Date.parse(now) + minutes * 60_000).toISOString();
    const B1 = await rule(w, { name: 'Burst cap', metric: 'spend', period: 'rolling', window_hours: 1, threshold_amount_nanos: nanos(10),
      action: 'block', block_at_amount_nanos: nanos(20), cooldown_minutes: 30 });
    await addUsage(w, nanos(25), minus(30));
    let result = await evaluate(w, now, true);
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].state, 'started');
    let block = await one('select * from public.workspace_spend_blocks where rule_id = $1', [B1]);
    assert.equal(block.resets_at, null, 'a rolling block has no reset');
    assert.equal(ms(block.period_start), minus(60));
    result = await evaluate(w, plus(10), true);
    assert.equal(result.blocks.length, 0, 'still over the limit: the block holds');
    result = await evaluate(w, plus(40), true);
    assert.deepEqual(result.blocks.map((item) => [item.state, item.reason]), [['lifted', 'below_limit']], 'the spend left the window');

    // A manual lift holds for one window.
    await addUsage(w, nanos(25), now);
    const fresh = await evaluate(w, plus(1), true);
    assert.equal(fresh.blocks[0]?.state, 'started');
    block = await one('select * from public.workspace_spend_blocks where rule_id = $1 and lifted_at is null', [B1]);
    await db.query(`select public.lift_workspace_spend_block($1, $2, $3, $4::timestamptz)`, [w.ws, block.id, owner, plus(2)]);
    assert.equal((await evaluate(w, plus(3), true)).blocks.length, 0, 'lifted by hand: no new block within the window');
  }

  // ---- The sweep: rolling rules in the periodic pass, never in the rollover pass.
  {
    await db.exec('delete from public.workspace_spend_rule_dirty');
    const sweep = await one('select public.sweep_spend_rules($1::timestamptz, 1000, false) r', ['2026-12-01T00:00:00Z']);
    const rolloverRules = await one(`select count(*)::int n from public.workspace_spend_rules rule
      where rule.period = 'rolling' and exists (select 1 from public.workspace_spend_rule_state s where s.rule_id = rule.id and s.period_start <> '-infinity')`);
    assert.equal(rolloverRules.n, 0, 'rolling rules never get calendar state rows');
    assert(sweep.r.rollover > 0, 'calendar rules (including forecasts) roll over into December');
  }

  // ---- Cost per workspace: the evaluator over 100 workspaces with five calendar rules each
  // (two of them forecasts, one against the previous month) and 96 rollup rows per workspace
  // over two months.
  {
    const count = 100;
    const timings = { spend: [], forecast: [] };
    const made = [];
    for (let i = 0; i < count; i += 1) {
      const w = await workspace(`Bench ${i}`, 'Europe/London');
      made.push(w);
      for (let day = 0; day < 48; day += 1) {
        await addUsage(w, nanos(1 + (i % 7)), new Date(Date.parse('2026-09-05T10:00:00Z') + day * 86_400_000).toISOString());
        await addUsage(w, nanos(0.5), new Date(Date.parse('2026-09-05T18:00:00Z') + day * 86_400_000).toISOString());
      }
      await rule(w, { name: 'Spend', metric: 'spend', period: 'month', threshold_amount_nanos: nanos(10_000) });
      await rule(w, { name: 'Budget', metric: 'budget_percent', period: 'month', base_kind: 'amount', base_amount_nanos: nanos(10_000), threshold_percents: [50, 80, 100] });
      await rule(w, { name: 'Daily', metric: 'spend', period: 'day', threshold_amount_nanos: nanos(10_000) });
    }
    const run = async (label) => {
      for (const w of made) {
        const started = performance.now();
        await evaluate(w, '2026-10-22T12:00:00Z');
        timings[label].push(performance.now() - started);
      }
    };
    await run('spend');
    for (const w of made) {
      await rule(w, { name: 'Forecast', metric: 'forecast', period: 'month', threshold_amount_nanos: nanos(10_000) });
      await rule(w, { name: 'Forecast vs last month', metric: 'forecast', period: 'month', base_kind: 'previous_period', threshold_percents: [500] });
    }
    await run('forecast');
    const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
    console.log(`evaluator per workspace (median of ${count}): 3 spend/budget rules ${median(timings.spend).toFixed(2)} ms; `
      + `plus 2 forecasts (one vs the previous month) ${median(timings.forecast).toFixed(2)} ms`);
  }

  console.log('spend-rules-forecast: ok');
} finally {
  await db.close();
}
