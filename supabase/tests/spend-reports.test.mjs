// Standalone PostgreSQL regression test for spend reports.
// public.queue_spend_reports queues a daily, weekly or monthly spend report for each workspace from
// 09:00 to 21:00 in its billing_time_zone on the first day after the period: one routed
// spend_report event and one spend_report_email per owner (and admin, when included) who has not
// unsubscribed, skipping periods without spend, once per workspace, cadence and period.
// private.spend_report_facts computes the whole report in SQL; its totals must match the usage
// overview (and the mobile digest's summary of it), its forecast the forecast spend rules, and its
// runway the balance spend rules.
// Runs the spend rules migrations whole on a minimal pre-migration schema, and prints the cost of
// one report and of the quiet-workspace pass.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/spend-reports.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
const find = (suffix) => migrations.find((name) => name.endsWith(suffix));
const stack = ['_spend_rules_schema.sql', '_spend_rules_evaluator.sql', '_spend_rules_api.sql', '_spend_rule_blocks.sql',
  '_spend_rules_balance.sql', '_spend_rules_forecast.sql', '_spend_rules_spike.sql', '_spend_reports.sql'].map(find);
assert(stack.every(Boolean), 'the spend rules migrations exist');
const migrationName = stack[7];
assert(migrationName > stack[6], 'the reports migration runs after the spike migration');
assert.equal(migrationName, migrations.filter((name) => name <= migrationName).at(-1), 'the reports migration is the newest so far');
const migration = await read(`../migrations/${migrationName}`);
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();

// ---- The migration carries the schema files, CI runs this suite.
const files = [
  'public/tables/workspace_spend_report_recipients.sql',
  'public/tables/workspace_spend_report_runs.sql',
  'private/functions/spend_report_period.sql',
  'private/functions/spend_report_people.sql',
  'private/functions/spend_report_due_workspaces.sql',
  'private/functions/spend_report_facts.sql',
  'public/functions/queue_spend_reports.sql',
  'public/functions/set_spend_report_subscription.sql',
];
const laterMigrations = migrations.filter((name) => name > migrationName);
for (const file of files) {
  const signature = file.includes('/functions/') ? `FUNCTION ${file.split('/')[0]}.${file.split('/').pop().replace(/\.sql$/, '')}` : null;
  let newest = migration;
  for (const name of laterMigrations) {
    const sql = await read(`../migrations/${name}`);
    if (signature && sql.includes(signature)) newest = sql;
  }
  assert(normalize(newest).includes(normalize(await read(`../schemas/${file}`))), `${file} is in the newest migration that defines it`);
}
const settingsTable = normalize(await read('../schemas/public/tables/workspace_settings.sql'));
for (const text of [
  `"spend_report_cadence"                         text                     NOT NULL DEFAULT 'weekly'::text,`,
  `"spend_report_include_admins"                  boolean                  NOT NULL DEFAULT false,`,
  `CONSTRAINT "workspace_settings_spend_report_cadence_check" CHECK ((spend_report_cadence = ANY (ARRAY['off'::text, 'daily'::text, 'weekly'::text, 'monthly'::text])))`,
]) assert(settingsTable.includes(text), `workspace_settings.sql declares ${text.slice(0, 40)}`);
for (const start of ['COMMENT ON COLUMN "public"."workspace_settings"."spend_report_cadence"', 'COMMENT ON COLUMN "public"."workspace_settings"."spend_report_include_admins"']) {
  const at = settingsTable.indexOf(start);
  assert(at >= 0 && normalize(migration).includes(settingsTable.slice(at, settingsTable.indexOf(';\n', at) + 1)), `the migration carries ${start}`);
}
assert.match(migration, /ADD COLUMN IF NOT EXISTS "spend_report_cadence" text NOT NULL DEFAULT 'weekly'::text/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS "spend_report_include_admins" boolean NOT NULL DEFAULT false/);
assert(!/\b(drop\s+(table|schema|type|view|column|function)|truncate|delete\s+from)\b/i.test(migration), 'the migration is not destructive');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/spend-reports\.test\.mjs/, 'CI runs this suite');
const exported = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of files) assert(exported.loadOrder.includes(file) && exported.files.includes(file), `${file} is in the declarative export`);

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DOLLAR = 1e9;
const nanos = (dollars) => Math.round(dollars * DOLLAR);
const iso = (value) => (value === null || value === undefined ? null : new Date(value).toISOString());
const [owner, admin, member, coOwner, otherOwner] = [id(1), id(2), id(3), id(4), id(5)];

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];

try {
  await db.exec(`
    set timezone = 'UTC';
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to authenticated, service_role;
    grant usage on schema private to service_role;
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
      attempts integer not null default 0, last_error text, sent_at timestamptz, dedupe_key text unique);
    create index email_outbox_workspace_id_idx on public.email_outbox (workspace_id);
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
    create index gateway_requests_async_spend_idx on public.gateway_requests (workspace_id, created_at) include (key_id, cost_nanos)
      where success is true and endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime']);
    create table public.v2_models (model_slug text primary key, name text not null);
    create table public.v2_model_provider_routes (provider_model_id text primary key, model_slug text not null, provider_slug text not null);
    -- The usage overview's sources (as in private-usage-overview.test.mjs).
    create table public.v2_request_facts (
      request_event_id uuid primary key, workspace_id uuid, occurred_at timestamptz, app_id uuid, key_id uuid,
      endpoint text, requested_model_input text, requested_model_slug text, routed_model_slug text,
      provider_model_id text, success boolean, error_code text, byok boolean, safe_metadata jsonb, cost_nanos bigint,
      auth_method text, gateway_request_id uuid, gateway_request_created_at timestamptz
    );
    create table public.v2_request_usage (request_event_id uuid, meter_key text, quantity numeric(30,12), sequence integer default 0);
    create table public.v2_analytics_outbox (request_event_id uuid primary key, workspace_id uuid, occurred_at timestamptz, status text);
  `);
  await db.exec(await read('../schemas/private/tables/v2_analytics_previous_grains.sql'));
  await db.exec((await read('../schemas/public/tables/v2_private_usage_15m.sql')).replace(/,\r?\n  CONSTRAINT "v2_private_usage_15m_workspace_id_fkey"[^\r\n]*/, ''));
  await db.exec((await read('../schemas/public/tables/v2_private_usage_labels_15m.sql')).replace(/,\r?\n  CONSTRAINT "v2_private_usage_labels_15m_workspace_id_fkey"[^\r\n]*/, ''));
  for (const file of [
    'private/views/v2_usage_overview_requests.sql',
    'public/functions/get_private_usage_overview.sql',
    'private/functions/mobile_week_usage.sql',
    'private/functions/mobile_push_compact_number.sql',
    'public/functions/set_updated_at_if_changed.sql',
    'public/functions/is_workspace_member.sql',
    'public/tables/workspace_notification_events.sql',
    'public/tables/workspace_notification_cursors.sql',
    'private/functions/workspace_push_usd.sql',
    'private/functions/workspace_push_message.sql',
    'private/functions/spend_scope_departments.sql',
    'private/functions/spend_department_totals.sql',
  ]) await db.exec(await read(`../schemas/${file}`));
  for (const name of stack) await db.exec(await read(`../migrations/${name}`));

  // ---- Settings columns, grants and RLS.
  const columns = await rows(`select column_name, data_type, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'workspace_settings' and column_name like 'spend_report%' order by column_name`);
  assert.deepEqual(columns.map((c) => [c.column_name, c.data_type, c.column_default]), [
    ['spend_report_cadence', 'text', "'weekly'::text"],
    ['spend_report_include_admins', 'boolean', 'false'],
  ]);
  const functions = ['spend_report_period', 'spend_report_people', 'spend_report_due_workspaces', 'spend_report_facts', 'queue_spend_reports', 'set_spend_report_subscription'];
  const grants = await rows(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') authenticated, has_function_privilege('service_role', p.oid, 'execute') service
    from pg_proc p where p.proname = any($1)`, [functions]);
  assert.equal(grants.length, functions.length, 'one definition of each');
  for (const grant of grants) {
    assert.equal(grant.anon, false, `${grant.proname}: anon`);
    assert.equal(grant.authenticated, false, `${grant.proname}: authenticated`);
    assert.equal(grant.service, true, `${grant.proname}: service_role`);
  }
  for (const table of ['workspace_spend_report_recipients', 'workspace_spend_report_runs']) {
    const t = await one(`select relrowsecurity rls, has_table_privilege('authenticated', oid, 'select') auth_select,
      has_table_privilege('anon', oid, 'select') anon_select, has_table_privilege('service_role', oid, 'update') service_update
      from pg_class where relname = $1`, [table]);
    assert.deepEqual(t, { rls: true, auth_select: false, anon_select: false, service_update: true }, `${table}: service role only`);
  }

  // ---- Periods: the last complete period in the zone, due 09:00 to 21:00 local the day after.
  const period = async (cadence, zone, now) => one(`select due, period_start, period_end, previous_start, previous_end, due_from, due_until
    from private.spend_report_period($1, $2, $3::timestamptz)`, [cadence, zone, now]);
  const shape = (p) => p && { due: p.due, start: iso(p.period_start), end: iso(p.period_end), previousStart: iso(p.previous_start), previousEnd: iso(p.previous_end) };
  // Monday 19 October 2026, 09:30 in London (BST, UTC+1): the ISO week of 12–18 October.
  assert.deepEqual(shape(await period('weekly', 'Europe/London', '2026-10-19T08:30:00Z')), {
    due: true, start: '2026-10-11T23:00:00.000Z', end: '2026-10-18T23:00:00.000Z',
    previousStart: '2026-10-04T23:00:00.000Z', previousEnd: '2026-10-11T23:00:00.000Z',
  });
  assert.equal((await period('weekly', 'Europe/London', '2026-10-19T07:59:59Z')).due, false, 'not before 09:00 local');
  assert.equal((await period('weekly', 'Europe/London', '2026-10-19T19:59:59Z')).due, true, 'still due at 20:59 local');
  assert.equal((await period('weekly', 'Europe/London', '2026-10-19T20:00:00Z')).due, false, 'not from 21:00 local');
  assert.equal((await period('weekly', 'Europe/London', '2026-10-20T08:30:00Z')).due, false, 'only on Monday');
  // The same instant is 04:30 in New York (not yet due) and 17:30 in Tokyo (due until 21:00 JST).
  assert.equal((await period('weekly', 'America/New_York', '2026-10-19T08:30:00Z')).due, false);
  assert.equal((await period('weekly', 'Asia/Tokyo', '2026-10-19T08:30:00Z')).due, true);
  assert.equal((await period('weekly', 'Asia/Tokyo', '2026-10-19T12:00:00Z')).due, false);
  assert.equal((await period('weekly', 'America/New_York', '2026-10-19T13:00:00Z')).due, true, '09:00 EDT');
  // A DST week: London leaves BST on Sunday 25 October, so 19–25 October lasts 169 hours.
  const dst = await period('weekly', 'Europe/London', '2026-10-26T09:05:00Z');
  assert.deepEqual(shape(dst), {
    due: true, start: '2026-10-18T23:00:00.000Z', end: '2026-10-26T00:00:00.000Z',
    previousStart: '2026-10-11T23:00:00.000Z', previousEnd: '2026-10-18T23:00:00.000Z',
  });
  assert.equal((Date.parse(dst.period_end) - Date.parse(dst.period_start)) / 3_600_000, 169);
  assert.equal((await period('weekly', 'Europe/London', '2026-10-26T08:05:00Z')).due, false, '09:00 GMT is 09:00 UTC after the change');
  // New York leaves DST a week later; its week of 26 October–1 November also lasts 169 hours.
  const nyDst = await period('weekly', 'America/New_York', '2026-11-02T14:00:00Z');
  assert.equal(nyDst.due, true);
  assert.equal(iso(nyDst.period_start), '2026-10-26T04:00:00.000Z');
  assert.equal(iso(nyDst.period_end), '2026-11-02T05:00:00.000Z');
  // Daily in Tokyo at 09:30 JST on 21 October: 20 October JST.
  assert.deepEqual(shape(await period('daily', 'Asia/Tokyo', '2026-10-21T00:30:00Z')), {
    due: true, start: '2026-10-19T15:00:00.000Z', end: '2026-10-20T15:00:00.000Z',
    previousStart: '2026-10-18T15:00:00.000Z', previousEnd: '2026-10-19T15:00:00.000Z',
  });
  // Monthly on the 1st: the month before, and the one before that.
  assert.deepEqual(shape(await period('monthly', 'UTC', '2026-11-01T09:00:00Z')), {
    due: true, start: '2026-10-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z',
    previousStart: '2026-09-01T00:00:00.000Z', previousEnd: '2026-10-01T00:00:00.000Z',
  });
  assert.equal((await period('monthly', 'UTC', '2026-11-02T09:00:00Z')).due, false);
  assert.equal((await period('monthly', 'UTC', '2026-03-01T10:00:00Z')).previous_start.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(await period('off', 'UTC', '2026-11-01T09:00:00Z'), undefined, 'off has no period');

  // ---- Fixture: Acme (London, weekly) with three keys, two departments and a stale hour.
  await db.exec(`
    insert into auth.users (id, email) values ('${owner}', 'owner@example.com'), ('${admin}', 'admin@example.com'),
      ('${member}', 'member@example.com'), ('${coOwner}', 'co-owner@example.com'), ('${otherOwner}', 'beta@example.com');
    insert into public.users values ('${owner}', 'Olivia Owner'), ('${member}', 'Max Member');
    insert into public.v2_models values ('openai/gpt-5', 'GPT-5'), ('anthropic/claude', 'Claude');
    insert into public.v2_model_provider_routes values ('route-gpt', 'openai/gpt-5', 'openai'), ('route-claude', 'anthropic/claude', 'anthropic');
  `);
  let next = 100;
  const keyIds = {};
  const workspace = async (name, { zone = null, cadence = null, includeAdmins = false, ownerId = owner } = {}) => {
    const ws = id(next++);
    await db.query('insert into public.workspaces values ($1, $2, $3)', [ws, name, ownerId]);
    await db.query(`insert into public.workspace_members values ($1, $2, 'owner')`, [ws, ownerId]);
    await db.query('insert into public.workspace_settings (workspace_id) values ($1)', [ws]);
    if (zone) await db.query('update public.workspace_settings set billing_time_zone = $2 where workspace_id = $1', [ws, zone]);
    if (cadence) await db.query('update public.workspace_settings set spend_report_cadence = $2 where workspace_id = $1', [ws, cadence]);
    if (includeAdmins) await db.query('update public.workspace_settings set spend_report_include_admins = true where workspace_id = $1', [ws]);
    return ws;
  };
  const addKey = async (ws, name, createdBy, departmentId = null) => {
    const key = id(next++);
    await db.query('insert into public.keys (id, workspace_id, name, created_by, department_id) values ($1, $2, $3, $4, $5)', [key, ws, name, createdBy, departmentId]);
    keyIds[name] = key;
    return key;
  };
  const addUsage = async (ws, key, actor, dollars, bucket, { model = 'openai/gpt-5', route = 'route-gpt', requests = 1, input = 0, output = 0 } = {}) => db.query(
    `insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, actor_user_id, requests, successful_requests,
       cost_nanos, tokens, input_tokens, output_tokens)
      values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9::numeric + $10::numeric, $9, $10)
      on conflict (workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok, actor_user_id)
      do update set cost_nanos = public.v2_private_usage_15m.cost_nanos + excluded.cost_nanos`,
    [ws, bucket, model, route, key, actor, requests, nanos(dollars), input, output]);
  const addFact = async (ws, key, dollars, at, { input = 0, output = 0 } = {}) => {
    const event = id(next++);
    await db.query(`insert into public.v2_request_facts (request_event_id, workspace_id, occurred_at, key_id, endpoint, routed_model_slug,
        provider_model_id, success, byok, cost_nanos, auth_method) values ($1, $2, $3, $4, 'chat.completions', 'openai/gpt-5', 'route-gpt', true, false, $5, 'key')`,
    [event, ws, at, key, nanos(dollars)]);
    await db.query(`insert into public.v2_request_usage (request_event_id, meter_key, quantity) values ($1, 'input_tokens', $2), ($1, 'output_tokens', $3)`, [event, input, output]);
    return event;
  };
  const addAsync = async (ws, key, dollars, at) => db.query(`insert into public.gateway_requests (created_at, workspace_id, key_id, endpoint, success, cost_nanos, model_id, provider)
    values ($1, $2, $3, 'video.generation', true, $4, 'openai/sora', 'openai')`, [at, ws, key, nanos(dollars)]);
  const facts = async (ws, cadence, now) => (await one('select private.spend_report_facts($1, $2, $3::timestamptz) f', [ws, cadence, now])).f;
  const queue = async (now, limit = 50) => (await one('select public.queue_spend_reports($1::timestamptz, $2) r', [now, limit])).r;
  const outbox = async (ws) => rows(`select kind, template, to_email, subject, user_id, dedupe_key, payload, attempts, last_error
    from public.email_outbox where workspace_id = $1 and kind like 'spend_report%' order by kind, to_email, dedupe_key`, [ws]);
  const runOf = async (ws, cadence = 'weekly') => one('select * from public.workspace_spend_report_runs where workspace_id = $1 and cadence = $2', [ws, cadence]);

  const acme = await workspace('Acme', { zone: 'Europe/London' });
  await db.exec(`
    insert into public.workspace_members values ('${acme}', '${admin}', 'admin'), ('${acme}', '${member}', 'member'), ('${acme}', '${coOwner}', 'owner');
  `);
  const eng = id(next++);
  const ops = id(next++);
  await db.query(`insert into public.workspace_departments values ($1, $3, 'Engineering'), ($2, $3, 'Operations')`, [eng, ops, acme]);
  await db.query(`insert into public.workspace_department_grants (workspace_id, user_id, department_id, is_primary) values ($1, $2, $3, true), ($1, $2, $4, false)`, [acme, member, eng, ops]);
  const prod = await addKey(acme, 'prod', owner);
  const staging = await addKey(acme, 'staging', admin, ops);
  const memberKey = await addKey(acme, 'member-key', member);
  // The week of 12–18 October (London): $40 + $25 + $15, and a stale hour the overview reads from
  // the requests ($10) instead of the out-of-date rollup ($8).
  await addUsage(acme, prod, owner, 40, '2026-10-13T10:00:00Z', { requests: 100, input: 6000, output: 4000 });
  await addUsage(acme, staging, admin, 25, '2026-10-14T10:00:00Z', { model: 'anthropic/claude', route: 'route-claude', requests: 50, input: 3000, output: 2000 });
  await addUsage(acme, memberKey, member, 15, '2026-10-15T10:00:00Z', { requests: 30, input: 2000, output: 1000 });
  await addUsage(acme, prod, owner, 8, '2026-10-16T12:00:00Z', { requests: 1 });
  await addFact(acme, prod, 5, '2026-10-16T12:10:00Z', { input: 100, output: 50 });
  await addFact(acme, prod, 5, '2026-10-16T12:20:00Z', { input: 100, output: 50 });
  await db.query(`insert into public.v2_analytics_outbox values ($1, $2, '2026-10-16T12:10:00Z', 'pending')`, [id(next++), acme]);
  // A video job: spend rules count it toward the member and departments; the overview does not.
  await addAsync(acme, memberKey, 6, '2026-10-15T11:00:00Z');
  // Around the week: 23:30 BST on Sunday 11 October and the previous week ($20 + $40 = $60), and
  // 00:15 BST on Monday 19 October (the next week, but this month).
  // The overview reads the last half hour of a range from the requests, as production has both.
  await addUsage(acme, prod, owner, 20, '2026-10-11T22:30:00Z');
  await addFact(acme, prod, 20, '2026-10-11T22:35:00Z');
  await addUsage(acme, prod, owner, 40, '2026-10-07T10:00:00Z');
  await addUsage(acme, prod, owner, 7, '2026-10-18T23:15:00Z');
  await db.query(`insert into public.wallets (workspace_id, balance_nanos, reserved_nanos) values ($1, $2, $3)`, [acme, nanos(500), nanos(20)]);
  // Alerts: two from one rule and one from another in the week, one the morning after.
  const alertRow = (ruleId, ruleName, metric, title, at) => db.query(`insert into public.email_outbox (created_at, kind, template, to_email, subject, workspace_id, payload, dedupe_key)
    values ($1, 'spend_alert', 'spend_alert', '', $2, $3, $4, $5)`,
  [at, title, acme, JSON.stringify({ rule_id: ruleId, rule_name: ruleName, metric, title }), `spend_alert:test:${at}:${ruleId}`]);
  const ruleX = id(next++);
  const ruleY = id(next++);
  await alertRow(ruleX, 'Monthly', 'budget_percent', 'Monthly: 50% of $100.00 reached', '2026-10-13T12:00:00Z');
  await alertRow(ruleX, 'Monthly', 'budget_percent', 'Monthly: 80% of $100.00 reached', '2026-10-15T12:00:00Z');
  await alertRow(ruleY, 'Spike', 'spike', 'Spike: spend 4.2× usual in the last 3 hours', '2026-10-14T12:00:00Z');
  await alertRow(ruleY, 'Spike', 'spike', 'Spike: later', '2026-10-19T00:00:00Z');
  // Blocks: one started in the week and still active, one lifted during the week after starting
  // before it, and one lifted before the week (left out).
  const blockRule = (await one(`insert into public.workspace_spend_rules (workspace_id, name, metric, period, threshold_amount_nanos, action, block_at_amount_nanos)
    values ($1, 'Daily cap', 'spend', 'day', $2, 'block', $2) returning id`, [acme, nanos(30)])).id;
  const block = (ruleId, started, lifted, periodStart, resets) => db.query(`insert into public.workspace_spend_blocks
      (workspace_id, rule_id, scope_type, scope_id, period_start, resets_at, spend_nanos, limit_nanos, started_at, lifted_at, lift_reason)
    values ($1, $2, 'workspace', null, $3, $4, $5, $5, $6, $7, case when $7::timestamptz is null then null else 'period_reset' end)`,
  [acme, ruleId, periodStart, resets, nanos(30), started, lifted]);
  await block(blockRule, '2026-10-17T15:00:00Z', null, '2026-10-16T23:00:00Z', '2026-10-17T23:00:00Z');
  await block(null, '2026-10-11T20:00:00Z', '2026-10-12T09:00:00Z', '2026-10-10T23:00:00Z', '2026-10-11T23:00:00Z');
  await block(null, '2026-10-09T20:00:00Z', '2026-10-10T09:00:00Z', '2026-10-08T23:00:00Z', '2026-10-09T23:00:00Z');

  // ---- Content: totals match the usage overview and the digest's summary of it.
  const NOW = '2026-10-19T08:30:00Z';
  const report = await facts(acme, 'weekly', NOW);
  const overview = await one(`select coalesce(sum((cell ->> 'costNanos')::numeric), 0) spend, coalesce(sum((cell ->> 'requests')::numeric), 0) requests,
      coalesce(sum((cell ->> 'tokens')::numeric), 0) tokens
    from jsonb_array_elements(public.get_private_usage_overview($1, '2026-10-11T23:00:00Z', '2026-10-18T22:59:59.999999Z', null, 'Europe/London')) cell`, [acme]);
  const digest = (await one(`select private.mobile_week_usage($1, '2026-10-11T23:00:00Z', '2026-10-18T23:00:00Z', 'Europe/London') u`, [acme])).u;
  assert.equal(Number(report.totals.spend_nanos), nanos(90), 'the stale hour counts its requests ($10), not the old rollup row ($8)');
  assert.equal(Number(report.totals.spend_nanos), Number(overview.spend), 'spend matches the overview');
  assert.equal(Number(report.totals.requests), Number(overview.requests), 'requests match the overview');
  assert.equal(Number(report.totals.tokens), Number(overview.tokens), 'tokens match the overview');
  assert.equal(Number(report.totals.spend_nanos), Number(digest.spendNanos), 'spend matches the digest summary');
  assert.equal(Number(report.totals.requests), Number(digest.requests));
  assert.equal(Number(report.totals.tokens), Number(digest.tokens));
  assert.equal(Number(report.totals.requests), 182);
  assert.equal(Number(report.totals.tokens), 18300);
  assert.equal(Number(report.previous_totals.spend_nanos), nanos(60));
  assert.equal(Number(report.change.spend_nanos), nanos(30));
  assert.equal(Number(report.change.spend_percent), 50);
  assert.equal(report.cadence, 'weekly');
  assert.equal(report.time_zone, 'Europe/London');
  assert.equal(iso(report.period.start), '2026-10-11T23:00:00.000Z');
  assert.equal(report.period.label, 'Oct 12 – Oct 18, 2026');
  assert.equal(report.period.local_start, '2026-10-12');
  assert.equal(report.period.local_end, '2026-10-18');
  assert.deepEqual(report.top_keys.map((k) => [k.name, Number(k.spend_nanos)]), [['prod', nanos(50)], ['staging', nanos(25)], ['member-key', nanos(15)]]);
  assert.deepEqual(report.top_models.map((m) => [m.name, Number(m.spend_nanos)]), [['GPT-5', nanos(65)], ['Claude', nanos(25)]]);
  // Members: the rollup as it stands (the stale $8) plus the video job, as spend rules count them.
  assert.deepEqual(report.top_members.map((m) => [m.name, m.email, Number(m.spend_nanos)]), [
    ['Olivia Owner', 'owner@example.com', nanos(48)], ['admin@example.com', 'admin@example.com', nanos(25)], ['Max Member', 'member@example.com', nanos(21)],
  ]);
  // Departments: staging's own department wins; the member counts toward both of theirs.
  assert.equal(report.department_attribution, 'all');
  assert.deepEqual(report.top_departments.map((d) => [d.name, Number(d.spend_nanos)]), [['Operations', nanos(46)], ['Engineering', nanos(21)]]);
  await db.query(`update public.workspace_settings set department_spend_attribution = 'primary' where workspace_id = $1`, [acme]);
  assert.deepEqual((await facts(acme, 'weekly', NOW)).top_departments.map((d) => [d.name, Number(d.spend_nanos)]),
    [['Operations', nanos(25)], ['Engineering', nanos(21)]], 'primary only: the member counts toward Engineering');
  await db.query(`update public.workspace_settings set department_spend_attribution = 'all' where workspace_id = $1`, [acme]);
  assert.equal(report.alerts.fired, 3);
  assert.deepEqual(report.alerts.rules.map((r) => [r.rule_name, r.fired, r.last_title]), [
    ['Monthly', 2, 'Monthly: 80% of $100.00 reached'], ['Spike', 1, 'Spike: spend 4.2× usual in the last 3 hours'],
  ]);
  assert.equal(report.blocks.active, 1);
  assert.equal(report.blocks.started, 1);
  assert.deepEqual(report.blocks.items.map((b) => [b.rule_name, b.active, b.scope_label]), [['Daily cap', true, 'Acme'], ['Deleted rule', false, 'Acme']]);
  assert.equal(report.url, 'https://phaseo.app/settings/usage/overview');

  // ---- Forecast and runway: the same numbers as the forecast and balance spend rules.
  const forecastRule = (await one(`insert into public.workspace_spend_rules (workspace_id, name, metric, period, threshold_amount_nanos, enabled)
    values ($1, 'Month forecast', 'forecast', 'month', $2, false) returning id`, [acme, nanos(10000)])).id;
  const ruleForecast = await one('select projected_nanos, forecast_from, value_nanos from private.spend_rule_values($1, $2::timestamptz, $3)', [acme, NOW, forecastRule]);
  assert.equal(Number(report.forecast.spend_nanos), Number(ruleForecast.value_nanos), 'month spend so far matches the forecast rule');
  assert.equal(Number(report.forecast.projected_nanos), Number(ruleForecast.projected_nanos), 'the projection matches the forecast rule');
  assert.equal(iso(report.forecast.from), iso(ruleForecast.forecast_from));
  assert.equal(Number(report.forecast.spend_nanos), nanos(40 + 25 + 15 + 8 + 6 + 20 + 40 + 7), 'October so far, rollup plus the video job');
  assert.equal(report.forecast.month_label, 'October');
  const early = await facts(acme, 'monthly', '2026-11-01T09:30:00Z');
  assert.equal(early.forecast.projected_nanos, null, 'no projection in the first 72 hours of a month');
  assert.equal(early.forecast.month_label, 'November');
  const balanceRule = (await one(`insert into public.workspace_spend_rules (workspace_id, name, metric, period, window_hours, threshold_amount_nanos, enabled)
    values ($1, 'Balance', 'balance', 'rolling', 168, $2, false) returning id`, [acme, nanos(1)])).id;
  const ruleBalance = await one('select available_nanos, burn_nanos, burn_per_day_nanos, runway_days_left from private.spend_balance_rule_values($1, $2::timestamptz, $3)', [acme, NOW, balanceRule]);
  assert.equal(Number(report.runway.available_nanos), Number(ruleBalance.available_nanos));
  assert.equal(Number(report.runway.burn_nanos), Number(ruleBalance.burn_nanos), 'burn over 7 days matches a 168-hour balance rule');
  assert.equal(Number(report.runway.runway_days), Number(ruleBalance.runway_days_left), 'runway matches the balance rule');
  assert.equal(Number(report.runway.available_nanos), nanos(480));
  assert.equal(Number(report.runway.burn_nanos), nanos(40 + 25 + 15 + 8 + 6 + 7));
  assert.equal(report.runway.auto_top_up, false);

  // ---- The routed text.
  assert.equal(report.title, 'Acme weekly spend: $90.00 (Oct 12 – Oct 18, 2026)');
  const lines = report.message.split('\n');
  assert.equal(lines[0], 'Spent $90.00 in the week of Oct 12 – Oct 18, 2026, up 50% on the week before ($60.00). 182 requests, 18,300 tokens.');
  assert.equal(lines[1], 'Top models: GPT-5 $65.00, Claude $25.00.');
  assert.equal(lines[2], 'Top keys: prod $50.00, staging $25.00, member-key $15.00.');
  assert.match(lines[3], /^October forecast: \$[\d,]+\.\d\d \(\$161\.00 so far\)\.$/);
  assert.match(lines[4], /^Balance: \$480\.00, about \d+(\.\d)? days at the last 7 days' pace\.$/);
  assert.equal(lines[5], 'Spend alerts: 3 fired.');
  assert.equal(lines[6], 'Spend blocks: 1 active, 1 started.');
  assert.equal(lines[7], 'Usage: https://phaseo.app/settings/usage/overview');
  console.log('sample report text:\n' + report.title + '\n' + report.message);

  // ---- Other workspaces.
  const beta = await workspace('Beta', { includeAdmins: true, ownerId: otherOwner });
  await db.query(`insert into public.workspace_members values ($1, $2, 'admin'), ($1, $3, 'member')`, [beta, admin, member]);
  const betaKey = await addKey(beta, 'beta-key', otherOwner);
  await addUsage(beta, betaKey, otherOwner, 3, '2026-10-14T10:00:00Z');
  const quiet = await workspace('Quiet');
  await addUsage(quiet, await addKey(quiet, 'quiet-key', owner), owner, 9, '2026-10-01T10:00:00Z'); // before the week
  const free = await workspace('Free');
  await addUsage(free, await addKey(free, 'free-key', owner), owner, 0, '2026-10-14T10:00:00Z', { requests: 40 });
  const pending = await workspace('Pending');
  await db.query(`insert into public.v2_analytics_outbox values ($1, $2, '2026-10-14T10:00:00Z', 'pending')`, [id(next++), pending]);
  const off = await workspace('Off', { cadence: 'off' });
  await addUsage(off, await addKey(off, 'off-key', owner), owner, 12, '2026-10-14T10:00:00Z');
  const ny = await workspace('New York', { zone: 'America/New_York' });
  await addUsage(ny, await addKey(ny, 'ny-key', owner), owner, 4, '2026-10-14T10:00:00Z');
  const tokyo = await workspace('Tokyo', { zone: 'Asia/Tokyo', cadence: 'daily' });
  await addUsage(tokyo, await addKey(tokyo, 'tokyo-key', owner), owner, 2, '2026-10-20T03:00:00Z'); // 12:00 JST on 20 October
  const monthly = await workspace('Monthly', { cadence: 'monthly' });
  await addUsage(monthly, await addKey(monthly, 'monthly-key', owner), owner, 11, '2026-09-15T10:00:00Z');

  // ---- Queueing at 09:30 in London: Acme, and Tokyo's daily report (17:30 JST, no spend on 18 October).
  let result = await queue(NOW);
  assert.equal(result.skipped_locked, false);
  assert.deepEqual([result.due, result.quiet, result.zero_spend, result.queued, result.emails], [2, 1, 0, 1, 2]);
  assert.equal((await runOf(tokyo, 'daily')).status, 'skipped');
  const acmeKey = `spend_report:${acme}:weekly:2026-10-11T23:00:00Z`;
  assert.equal(result.reports[0].dedupe_key, acmeKey);
  let sent = await outbox(acme);
  assert.deepEqual(sent.map((r) => [r.kind, r.template, r.to_email, r.dedupe_key]), [
    ['spend_report', 'spend_report', 'owner@example.com', acmeKey],
    ['spend_report_email', 'spend_report', 'co-owner@example.com', `${acmeKey}:email:${coOwner}`],
    ['spend_report_email', 'spend_report', 'owner@example.com', `${acmeKey}:email:${owner}`],
  ], 'owners only: the admin is not included by default, nor the member');
  assert.equal(sent[0].subject, report.title);
  assert.equal(sent[0].payload.recipient, undefined, 'the routed event carries no unsubscribe token');
  const tokens = await rows('select user_id, unsubscribe_token::text token, opted_out_at from public.workspace_spend_report_recipients where workspace_id = $1 order by user_id', [acme]);
  assert.deepEqual(tokens.map((t) => t.user_id), [owner, coOwner]);
  const ownerToken = tokens.find((t) => t.user_id === owner).token;
  assert.equal(sent.find((r) => r.user_id === owner && r.kind === 'spend_report_email').payload.recipient.unsubscribe_token, ownerToken);
  assert.equal(sent.find((r) => r.user_id === owner && r.kind === 'spend_report_email').payload.recipient.role, 'owner');
  assert.equal(Number(sent.find((r) => r.user_id === owner && r.kind === 'spend_report_email').payload.totals.spend_nanos), nanos(90));
  let run = await runOf(acme);
  assert.deepEqual([run.status, iso(run.period_start), Number(run.spend_nanos), run.recipients], ['queued', '2026-10-11T23:00:00.000Z', nanos(90), 2]);
  assert(run.event_id, 'the run records the routed event');

  // Dedupe: the same tick again does nothing; with the run row lost, the dedupe keys still hold.
  result = await queue(NOW);
  assert.deepEqual([result.due, result.queued, result.emails], [0, 0, 0]);
  await db.query('delete from public.workspace_spend_report_runs where workspace_id = $1', [acme]);
  result = await queue('2026-10-19T08:45:00Z');
  assert.deepEqual([result.due, result.queued, result.emails], [1, 1, 0], 'a retry recomputes but queues nothing new');
  assert.equal((await outbox(acme)).length, 3);
  assert.equal((await runOf(acme)).status, 'queued', 'the run row is back');

  // ---- 09:30 UTC: the UTC workspaces. Beta emails its admin too; the quiet ones are skipped.
  result = await queue('2026-10-19T09:30:00Z');
  assert.deepEqual([result.quiet, result.zero_spend, result.queued], [2, 1, 1], 'Quiet and Free have no spend; Pending is computed and has none');
  assert.deepEqual((await outbox(beta)).map((r) => [r.kind, r.to_email]), [
    ['spend_report', 'beta@example.com'], ['spend_report_email', 'admin@example.com'], ['spend_report_email', 'beta@example.com'],
  ], 'admins are included when the workspace opts in; members never are');
  assert.equal((await outbox(beta)).find((r) => r.to_email === 'admin@example.com').payload.recipient.role, 'admin');
  for (const ws of [quiet, free, pending]) {
    assert.deepEqual(await outbox(ws), [], 'nothing queued without spend');
    assert.equal((await runOf(ws)).status, 'skipped');
  }
  assert.equal(await runOf(off), undefined, 'cadence off never runs');
  assert.deepEqual(await outbox(ny), [], 'New York is not due at 05:30 EDT');
  assert.equal(iso((await runOf(tokyo, 'daily')).period_start), '2026-10-17T15:00:00.000Z', 'Tokyo is not due again at 18:30 JST');
  result = await queue('2026-10-19T13:05:00Z');
  assert.equal(result.queued, 1);
  assert.equal((await outbox(ny))[0].dedupe_key, `spend_report:${ny}:weekly:2026-10-12T04:00:00Z`);
  assert.equal((await queue('2026-10-19T13:10:00Z')).queued, 0);

  // ---- Daily in Tokyo, monthly in UTC.
  result = await queue('2026-10-21T00:30:00Z');
  assert.equal(result.queued, 1);
  const tokyoReport = (await outbox(tokyo))[0];
  assert.equal(tokyoReport.dedupe_key, `spend_report:${tokyo}:daily:2026-10-19T15:00:00Z`);
  assert.equal(tokyoReport.payload.period.label, 'Oct 20, 2026');
  assert.match(tokyoReport.payload.title, /^Tokyo daily spend: \$2\.00 \(Oct 20, 2026\)$/);
  assert.equal((await queue('2026-10-22T00:30:00Z')).queued, 0, 'no spend on 21 October in Tokyo');
  assert.equal((await runOf(tokyo, 'daily')).status, 'skipped');
  result = await queue('2026-10-01T09:05:00Z');
  assert.equal(result.queued, 1);
  const monthlyReport = (await outbox(monthly))[0];
  assert.equal(monthlyReport.dedupe_key, `spend_report:${monthly}:monthly:2026-09-01T00:00:00Z`);
  assert.equal(monthlyReport.payload.period.label, 'September 2026');
  assert.match(monthlyReport.payload.message, /^Spent \$11\.00 in September 2026, with no spend the month before\./);

  // ---- Unsubscribing: per person and workspace; unsent emails are cancelled.
  const subscription = async (token, subscribed) => (await one('select public.set_spend_report_subscription($1::uuid, $2) s', [token, subscribed])).s;
  assert.deepEqual(await subscription(ownerToken, null), { workspace_name: 'Acme', subscribed: true });
  assert.deepEqual(await subscription(ownerToken, false), { workspace_name: 'Acme', subscribed: false });
  assert.deepEqual(await subscription(ownerToken, false), { workspace_name: 'Acme', subscribed: false }, 'repeating it is harmless');
  sent = await outbox(acme);
  assert.deepEqual([sent.find((r) => r.user_id === owner && r.kind === 'spend_report_email').attempts, sent.find((r) => r.user_id === owner && r.kind === 'spend_report_email').last_error], [5, 'unsubscribed']);
  assert.equal(sent.find((r) => r.user_id === coOwner).attempts, 0, 'the co-owner still gets theirs');
  assert.equal(sent.find((r) => r.kind === 'spend_report').attempts, 0, 'the routed event is untouched');
  assert.equal(await subscription(id(999), false), null, 'unknown token');
  assert.equal((await outbox(beta)).find((r) => r.to_email === 'admin@example.com').attempts, 0, 'other workspaces are untouched');

  // ---- The DST week: 19–25 October (169 hours), without the unsubscribed owner.
  await addUsage(acme, prod, owner, 3, '2026-10-25T23:30:00Z'); // 23:30 GMT on Sunday: in the week
  await addFact(acme, prod, 3, '2026-10-25T23:40:00Z'); // the overview reads the last half hour from the requests
  await addUsage(acme, prod, owner, 100, '2026-10-26T00:10:00Z'); // Monday: the next week
  result = await queue('2026-10-26T09:05:00Z');
  const dstKey = `spend_report:${acme}:weekly:2026-10-18T23:00:00Z`;
  const dstRows = (await outbox(acme)).filter((r) => r.dedupe_key.startsWith(dstKey));
  assert.deepEqual(dstRows.map((r) => [r.kind, r.to_email]), [['spend_report', 'owner@example.com'], ['spend_report_email', 'co-owner@example.com']]);
  assert.equal(Number(dstRows[0].payload.totals.spend_nanos), nanos(7 + 3), 'the 169-hour week, nothing from Monday');
  assert.equal(dstRows[0].payload.period.label, 'Oct 19 – Oct 25, 2026');
  assert.equal(Number(dstRows[0].payload.change.spend_percent), Number(((10 - 90) / 90 * 100).toFixed(1)));
  assert.match(dstRows[0].payload.message, /, down 88\.9% on the week before \(\$90\.00\)\./);
  assert.deepEqual(await subscription(ownerToken, true), { workspace_name: 'Acme', subscribed: true }, 'subscribing again');

  // ---- Limits and errors.
  await assert.rejects(db.query('select public.queue_spend_reports(null, 10)'), /invalid_spend_report_time/);
  await assert.rejects(db.query(`select public.queue_spend_reports(now(), 0)`), /invalid_spend_report_limit/);
  await assert.rejects(db.query(`select public.queue_spend_reports(now(), 1001)`), /invalid_spend_report_limit/);
  await assert.rejects(db.query(`update public.workspace_settings set spend_report_cadence = 'hourly' where workspace_id = $1`, [acme]), /workspace_settings_spend_report_cadence_check/);
  assert.equal(await facts(acme, 'off', NOW), null, 'no report for off');

  // ---- Cost: one report over a busy week, and the quiet pass over many workspaces.
  const busy = await workspace('Busy', { zone: 'Europe/London' });
  const busyKeys = [await addKey(busy, 'busy-1', owner), await addKey(busy, 'busy-2', admin), await addKey(busy, 'busy-3', member)];
  await db.query(`insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, actor_user_id, requests, successful_requests, cost_nanos, tokens)
    select $1, b, case when k % 2 = 0 then 'openai/gpt-5' else 'anthropic/claude' end, case when k % 2 = 0 then 'route-gpt' else 'route-claude' end,
      ($2::uuid[])[k], ($3::uuid[])[k], 10, 10, 1000000 * k, 1000 * k
    from generate_series(timestamptz '2026-10-04T23:00:00Z', timestamptz '2026-10-19T08:15:00Z', interval '15 minutes') b
    cross join generate_series(1, 3) k`, [busy, busyKeys, [owner, admin, member]]);
  const timings = [];
  for (let i = 0; i < 5; i += 1) {
    const started = performance.now();
    await facts(busy, 'weekly', NOW);
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  const rollupRows = (await one('select count(*)::int n from public.v2_private_usage_15m where workspace_id = $1', [busy])).n;
  console.log(`spend_report_facts: ${timings[2].toFixed(1)} ms median over 5 (${rollupRows} rollup rows: two weeks of 15-minute buckets x 3 keys)`);
  await db.exec(`insert into public.workspaces (id, name, owner_user_id)
    select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Empty ' || n, '${owner}' from generate_series(1, 2000) n`);
  await db.exec(`update public.workspace_settings set spend_report_cadence = 'off' where workspace_id = '${busy}'`);
  let started = performance.now();
  result = await queue('2026-11-02T09:05:00Z');
  console.log(`queue_spend_reports quiet pass: ${(performance.now() - started).toFixed(1)} ms for ${result.quiet} quiet workspaces (${result.queued} queued)`);
  assert.equal(result.quiet >= 2000, true);
  started = performance.now();
  result = await queue('2026-11-02T09:10:00Z');
  console.log(`queue_spend_reports idle tick: ${(performance.now() - started).toFixed(1)} ms over ${2000 + next} workspaces`);
  assert.equal(result.due, 0);

  console.log('spend-reports: ok');
} finally {
  await db.close();
}
