// Standalone PostgreSQL regression test for the spend rules API functions: saving a rule and its
// destinations in one transaction (errors roll everything back), the dirty mark, the read-only
// preview (the evaluator's own value query and alert text, so a preview reads exactly like the
// alert the evaluator then sends), history paged in SQL through the new partial index, the
// 5-a-minute test send limiter, the CLI scopes, and grants. Runs the spend rules schema,
// evaluator and API migrations whole on a minimal pre-migration schema.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/spend-rules-api.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
const schemaMigrationName = migrations.find((name) => name.endsWith('_spend_rules_schema.sql'));
const evaluatorMigrationName = migrations.find((name) => name.endsWith('_spend_rules_evaluator.sql'));
const migrationName = migrations.find((name) => name.endsWith('_spend_rules_api.sql'));
assert(schemaMigrationName && evaluatorMigrationName && migrationName, 'the spend rules migrations exist');
assert(migrationName > evaluatorMigrationName, 'the API migration runs after the evaluator');
const migration = await read(`../migrations/${migrationName}`);
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();

// ---- The migration carries the schema files, the manifest lists the new ones, CI runs this suite.
const added = [
  'public/tables/workspace_spend_rule_test_sends.sql',
  'private/functions/spend_rule_values.sql',
  'private/functions/spend_rule_alert_text.sql',
  'public/functions/preview_workspace_spend_rule.sql',
  'public/functions/list_workspace_spend_rule_history.sql',
  'public/functions/save_workspace_spend_rule.sql',
  'public/functions/consume_spend_rule_test_send.sql',
];
for (const file of [...added, 'private/functions/evaluate_workspace_spend_rules.sql']) {
  assert(normalize(migration).includes(normalize(await read(`../schemas/${file}`))), `${file} is in the migration`);
}
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of added) for (const list of ['loadOrder', 'files']) assert(manifest[list].includes(file), `${file} is in the manifest's ${list}`);
const outboxIndex = (await read('../schemas/public/tables/email_outbox.sql')).match(/CREATE INDEX email_outbox_spend_rule_events_idx[^;]*;/)?.[0];
assert(outboxIndex && migration.includes(outboxIndex), 'the email_outbox index is declared and migrated');
assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /, 'the DELETEs inside the new functions are marked as reviewed');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/spend-rules-api\.test\.mjs/, 'CI runs this suite');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const W1 = id(1); // America/New_York billing zone
const W2 = id(2);
const owner = id(11);
const alice = id(12);
const K1 = id(21);
const D1 = id(31);
const dest = (n) => id(40 + n); // 1, 2 active in W1; 3 disabled in W1; 4 in W2; 5 deleted; 6 ephemeral
const NOW = '2026-10-20 15:07:00+00';

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const usage = (workspace, at, key, actor, model, route, dollars) => db.query(
  `insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, actor_user_id, requests, successful_requests, cost_nanos)
   values ($1, $2, $3, $4, $5, $6, 1, 1, $7)`, [workspace, at, model, route, key, actor, Math.round(dollars * 1e9)]);
const save = async (workspace, ruleId, rule, destinations = null, actor = owner) => (await one(
  'select public.save_workspace_spend_rule($1, $2, $3, $4, $5) r', [workspace, ruleId, JSON.stringify(rule), destinations, actor])).r;
const preview = async (ruleId, workspace = W1, now = NOW) => (await one('select public.preview_workspace_spend_rule($1, $2, $3) r', [workspace, ruleId, now])).r;
const history = async (ruleId, limit = 50, offset = 0, workspace = W1) => (await one('select public.list_workspace_spend_rule_history($1, $2, $3, $4) r', [workspace, ruleId, limit, offset])).r;
const count = async (sql, params) => (await one(`select count(*)::int n from ${sql}`, params)).n;
const pct = (name, base, thresholds, extra = {}) => ({ name, metric: 'budget_percent', period: 'month', base_kind: 'amount', base_amount_nanos: base * 1e9, threshold_percents: thresholds, ...extra });
const spend = (name, dollars, extra = {}) => ({ name, metric: 'spend', period: 'month', threshold_amount_nanos: dollars * 1e9, ...extra });

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
      template text not null default 'generic', to_email text not null, subject text, workspace_id uuid, user_id uuid, payload jsonb not null default '{}',
      dedupe_key text unique);
    create table public.workspace_audit_events (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), workspace_id uuid,
      actor_user_id uuid, action text, target_type text, target_id text, target_name text, metadata jsonb);
    create table public.workspace_settings (workspace_id uuid primary key references public.workspaces(id) on delete cascade, department_spend_attribution text not null default 'all');
    create table public.gateway_requests (id uuid primary key default gen_random_uuid(), created_at timestamptz not null, workspace_id uuid not null,
      key_id uuid, oauth_user_id uuid, endpoint text not null, success boolean, cost_nanos bigint, model_id text, provider text);
    create table public.v2_models (model_slug text primary key, name text not null);
    create table public.v2_model_provider_routes (provider_model_id text primary key, model_slug text not null, provider_slug text not null);
    insert into public.oauth_clients values ('phaseo_cli', array['keys:read'], null), ('other', array['keys:read'], null);
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
  await db.exec(await read(`../migrations/${evaluatorMigrationName}`));
  await db.exec(migration);

  // ---- Scopes: only the first-party CLI client gains them.
  assert.deepEqual((await one(`select allowed_scopes from public.oauth_clients where id = 'phaseo_cli'`)).allowed_scopes,
    ['keys:read', 'spend_rules:delete', 'spend_rules:read', 'spend_rules:write']);
  assert.deepEqual((await one(`select allowed_scopes from public.oauth_clients where id = 'other'`)).allowed_scopes, ['keys:read']);

  // ---- Grants: service role only.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const call of [
      `select public.preview_workspace_spend_rule('${W1}', '${W1}')`,
      `select public.list_workspace_spend_rule_history('${W1}', '${W1}')`,
      `select public.save_workspace_spend_rule('${W1}', null, '{}'::jsonb, null)`,
      `select public.consume_spend_rule_test_send('${W1}')`,
      `select * from private.spend_rule_values('${W1}', now())`,
      'select * from public.workspace_spend_rule_test_sends',
    ]) await assert.rejects(rows(call), /permission denied/, `${role}: ${call}`);
    await db.exec('reset role');
  }
  const executable = await rows(`select p.proname, has_function_privilege('service_role', p.oid, 'execute') ok from pg_proc p
    where p.proname in ('preview_workspace_spend_rule', 'list_workspace_spend_rule_history', 'save_workspace_spend_rule', 'consume_spend_rule_test_send', 'spend_rule_values', 'spend_rule_alert_text')`);
  assert.equal(executable.length, 6);
  assert.ok(executable.every((row) => row.ok), 'the service role runs every new function');

  // ---- Fixture: W1 bills in New York; alice owns K1 and is in Research.
  await db.exec(`
    insert into auth.users values ('${owner}', 'owner@example.com'), ('${alice}', 'alice@example.com');
    insert into public.workspaces values ('${W1}', 'Acme', '${owner}'), ('${W2}', 'Other', '${owner}');
    insert into public.workspace_members values ('${W1}', '${owner}', 'owner'), ('${W1}', '${alice}', 'member'), ('${W2}', '${owner}', 'owner');
    insert into public.workspace_settings (workspace_id) values ('${W1}'), ('${W2}');
    update public.workspace_settings set billing_time_zone = 'America/New_York' where workspace_id = '${W1}';
    insert into public.workspace_departments values ('${D1}', '${W1}', 'Research');
    insert into public.workspace_department_grants (workspace_id, user_id, department_id) values ('${W1}', '${alice}', '${D1}');
    insert into public.keys (id, workspace_id, name, created_by) values ('${K1}', '${W1}', 'prod', '${alice}');
    insert into public.v2_models values ('openai/gpt-5', 'GPT-5');
    insert into public.v2_model_provider_routes values ('route-gpt', 'openai/gpt-5', 'openai');
    insert into public.notification_destinations (id, workspace_id, status, is_ephemeral) values
      ('${dest(1)}', '${W1}', 'active', false), ('${dest(2)}', '${W1}', 'active', false), ('${dest(3)}', '${W1}', 'disabled', false),
      ('${dest(4)}', '${W2}', 'active', false), ('${dest(5)}', '${W1}', 'deleted', false), ('${dest(6)}', '${W1}', 'active', true);
  `);
  await usage(W1, '2026-10-05 10:00+00', K1, alice, 'openai/gpt-5', 'route-gpt', 47);
  await usage(W1, '2026-10-20 05:00+00', K1, alice, 'openai/gpt-5', 'route-gpt', 12);
  // Month (New York) so far: $59; today: $12.

  // ---- Save: create a rule with destinations; the workspace is marked for evaluation.
  const created = await save(W1, null, pct('Workspace monthly', 100, [100, 50, 80, 50]), [dest(2), dest(1), dest(1)]);
  const ruleId = created.rule.id;
  assert.deepEqual(created.rule.threshold_percents, [50, 80, 100], 'thresholds are stored sorted and distinct');
  assert.equal(created.rule.created_by, owner);
  assert.equal(created.rule.scope_type, 'workspace');
  assert.equal(created.rule.action, 'notify');
  assert.equal(created.rule.block_at_percent, 110);
  assert.equal(created.rule.cooldown_minutes, 360);
  assert.deepEqual(created.destination_ids, [dest(1), dest(2)], 'destinations are deduped and sorted');
  assert.equal(await count(`public.workspace_spend_rule_dirty where workspace_id = $1`, [W1]), 1, 'saving an enabled rule marks the workspace');

  // A disabled destination can be attached (it is skipped at delivery); deleted, ephemeral and
  // other-workspace destinations cannot, and the rule is not written either.
  const before = await count('public.workspace_spend_rules');
  for (const bad of [dest(4), dest(5), dest(6), id(99)]) {
    await assert.rejects(save(W1, null, spend('Bad', 5), [dest(1), bad]), /notification_destination_not_found/, `destination ${bad}`);
  }
  await assert.rejects(save(W1, null, spend('Too many', 5), Array.from({ length: 51 }, (_, n) => id(1000 + n))), /too_many_spend_rule_destinations/);
  await assert.rejects(save(W1, null, spend('Bad zone', 5, { time_zone: 'Mars/Olympus' })), /invalid_time_zone/);
  await assert.rejects(save(W1, null, spend('Bad scope', 5, { scope_type: 'key', scope_id: 'nope' })), /invalid_spend_rule_scope_id/);
  await assert.rejects(save(W1, null, spend('Other key', 5, { scope_type: 'key', scope_id: id(77) })), /workspace_spend_rules_key_fkey/);
  await assert.rejects(save(W1, null, { name: 'No threshold', metric: 'spend', period: 'month' }), /workspace_spend_rules_spend_fields_check/);
  await assert.rejects(save(W1, null, 'null'), /invalid_spend_rule/);
  assert.equal(await count('public.workspace_spend_rules'), before, 'failed saves write nothing');

  // ---- Save: replace. Destinations null keeps them; an array replaces them; [] clears them.
  const renamed = await save(W1, ruleId, { ...pct('Workspace monthly', 100, [50, 80, 100]), name: '  Renamed  ' });
  assert.equal(renamed.rule.name, 'Renamed', 'names are trimmed by the table trigger');
  assert.deepEqual(renamed.destination_ids, [dest(1), dest(2)], 'null keeps the destinations');
  assert.deepEqual((await save(W1, ruleId, pct('Workspace monthly', 100, [50, 80, 100]), [dest(3), dest(2)])).destination_ids, [dest(2), dest(3)]);
  assert.deepEqual((await save(W1, ruleId, pct('Workspace monthly', 100, [50, 80, 100]), [])).destination_ids, []);
  await save(W1, ruleId, pct('Workspace monthly', 100, [50, 80, 100]), [dest(1)]);
  await assert.rejects(save(W2, ruleId, pct('Moved', 100, [50])), /spend_rule_not_found/, 'another workspace cannot replace it');
  await assert.rejects(save(W1, id(98), pct('Missing', 100, [50])), /spend_rule_not_found/);
  await db.query('delete from public.workspace_spend_rule_dirty');
  const disabled = await save(W1, null, spend('Disabled spend', 1, { enabled: false }));
  assert.equal(await count('public.workspace_spend_rule_dirty'), 0, 'a disabled rule does not mark the workspace');

  // ---- Preview: the evaluator's numbers and text, read-only.
  const quietOutbox = await count('public.email_outbox');
  const p = await preview(ruleId);
  assert.equal(p.evaluated, true);
  assert.equal(p.time_zone, 'America/New_York', "the workspace's billing zone");
  assert.deepEqual(p.period, { kind: 'month', start: '2026-10-01T04:00:00+00:00', end: '2026-11-01T04:00:00+00:00' });
  assert.equal(p.value_nanos, 59e9);
  assert.equal(p.base_nanos, 100e9);
  assert.equal(p.percent, 59);
  assert.equal(p.reached_threshold_percent, 50);
  assert.deepEqual(p.next_threshold, { percent: 80, amount_nanos: 80e9 });
  assert.equal(p.block_at_nanos, null, 'notify rules do not block');
  assert.equal(p.state, null, 'no state row yet');
  assert.deepEqual(p.alert, {
    scope_label: 'Acme',
    title: 'Workspace monthly: 50% of $100.00 reached',
    message: 'The workspace has spent $59.00 this month: 59% of $100.00. Alerts at 50%, 80%, 100%. The month resets Nov 1, 00:00 America/New_York.',
  });
  assert.equal(await count('public.email_outbox'), quietOutbox, 'a preview queues nothing');
  assert.equal(await count('public.workspace_spend_rule_state'), 0, 'a preview writes no state');

  // The evaluator then sends exactly the previewed text.
  const evaluated = (await one('select private.evaluate_workspace_spend_rules($1, $2) r', [W1, NOW])).r;
  assert.equal(evaluated.fired, 1, 'only the enabled rule fires');
  const sent = await one(`select payload from public.email_outbox where kind = 'spend_alert' and payload ->> 'rule_id' = $1`, [ruleId]);
  assert.equal(sent.payload.title, p.alert.title);
  assert.equal(sent.payload.message, p.alert.message);
  assert.equal(sent.payload.value_nanos, p.value_nanos);
  assert.deepEqual((await preview(ruleId)).state, { highest_percent_fired: 50, amount_fired_at: null, last_fired_at: '2026-10-20T15:07:00+00:00', fire_count: 1 });

  // Below every threshold: the alert names the first threshold. A spend rule's next threshold is its amount.
  const high = (await save(W1, null, pct('High', 1000, [10, 20], { action: 'block', block_at_percent: 150 }))).rule.id;
  const highPreview = await preview(high);
  assert.equal(highPreview.reached_threshold_percent, null);
  assert.deepEqual(highPreview.next_threshold, { percent: 10, amount_nanos: 100e9 });
  assert.equal(highPreview.block_at_nanos, 1500e9, 'block point: block_at_percent of the base');
  assert.equal(highPreview.alert.title, 'High: 10% of $1,000.00 reached');
  const daily = (await save(W1, null, spend('Prod today', 20, { period: 'day', scope_type: 'key', scope_id: K1, action: 'block', block_at_amount_nanos: 25e9, time_zone: 'UTC' }))).rule.id;
  const dailyPreview = await preview(daily);
  assert.equal(dailyPreview.time_zone, 'UTC', "the rule's own zone");
  assert.equal(dailyPreview.value_nanos, 12e9);
  assert.deepEqual(dailyPreview.next_threshold, { percent: null, amount_nanos: 20e9 });
  assert.equal(dailyPreview.block_at_nanos, 25e9);
  assert.equal(dailyPreview.alert.message, "API key 'prod' has spent $12.00 today, past the $20.00 alert threshold. The day resets Oct 21, 00:00 UTC.");
  assert.equal((await preview(disabled.rule.id)).value_nanos, 59e9, 'disabled rules can be previewed');

  // Not evaluated yet: calendar rules still show spend so far; rolling rules have no period.
  const forecast = (await save(W1, null, { name: 'Forecast', metric: 'forecast', period: 'month', threshold_amount_nanos: 100e9 })).rule.id;
  const forecastPreview = await preview(forecast);
  assert.equal(forecastPreview.evaluated, false);
  assert.equal(forecastPreview.value_nanos, 59e9);
  assert.equal(forecastPreview.alert, null);
  const spike = (await save(W1, null, { name: 'Spike', metric: 'spike', period: 'rolling', window_hours: 6, spike_multiplier: 3, spike_floor_nanos: 5e9 })).rule.id;
  const spikePreview = await preview(spike);
  assert.equal(spikePreview.evaluated, false);
  assert.equal(spikePreview.period, null);
  assert.equal(spikePreview.value_nanos, null);
  assert.equal(spikePreview.time_zone, 'America/New_York');
  await assert.rejects(preview(ruleId, W2), /spend_rule_not_found/, 'another workspace cannot preview it');

  // ---- History: the rule's events, newest first, paged in SQL, with delivery counts.
  const event = async (kind, at, payload) => (await one(
    `insert into public.email_outbox (kind, to_email, workspace_id, created_at, payload) values ($1, '', $2, $3, $4) returning id`,
    [kind, W1, at, JSON.stringify(payload)])).id;
  const blocked = await event('spend_blocked', '2099-01-01 16:00+00', { rule_id: ruleId, title: 'Blocked', state: 'started' });
  await event('spend_alert', '2099-01-01 17:00+00', { rule_id: high, title: 'Other rule' });
  await event('low_balance', '2099-01-01 18:00+00', { rule_id: ruleId, title: 'Wrong kind' });
  const firedEvent = (await one(`select id from public.email_outbox where kind = 'spend_alert' and payload ->> 'rule_id' = $1`, [ruleId])).id;
  await db.exec(`insert into public.notification_delivery_attempts (event_id, destination_id, workspace_id, status) values
    ('${firedEvent}', '${dest(1)}', '${W1}', 'sent'), ('${firedEvent}', '${dest(2)}', '${W1}', 'failed'), ('${firedEvent}', '${dest(3)}', '${W1}', 'retry')`);
  const all = await history(ruleId);
  assert.deepEqual(all.events.map((row) => row.kind), ['spend_blocked', 'spend_alert'], 'only this rule\'s spend events, newest first');
  assert.equal(all.has_more, false);
  assert.equal(all.events[0].id, blocked);
  assert.equal(all.events[0].state, 'started');
  assert.equal(all.events[1].title, p.alert.title);
  assert.equal(all.events[1].threshold_percent, 50);
  assert.deepEqual(all.events[1].deliveries, { sent: 1, failed: 1, pending: 1 });
  assert.deepEqual(all.events[0].deliveries, { sent: 0, failed: 0, pending: 0 });
  assert.deepEqual(all.periods, [{
    period_start: '2026-10-01T04:00:00+00:00', period_end: '2026-11-01T04:00:00+00:00', highest_percent_fired: 50,
    amount_fired_at: null, last_fired_at: '2026-10-20T15:07:00+00:00', fire_count: 1, last_value_nanos: 59e9, last_base_nanos: 100e9,
  }]);
  const first = await history(ruleId, 1, 0);
  assert.deepEqual([first.events.length, first.events[0].id, first.has_more], [1, blocked, true]);
  const second = await history(ruleId, 1, 1);
  assert.deepEqual([second.events.length, second.events[0].id, second.has_more], [1, firedEvent, false], 'page positions restart on each page');
  assert.deepEqual((await history(ruleId, 1, 5)).events, []);
  for (const [limit, offset] of [[0, 0], [101, 0], [10, -1]]) await assert.rejects(history(ruleId, limit, offset), /invalid_spend_rule_history_page/);
  await assert.rejects(history(ruleId, 10, 0, W2), /spend_rule_not_found/);
  await db.exec('set enable_seqscan = off');
  const plan = (await rows(`explain select id from public.email_outbox
    where (payload ->> 'rule_id') = '${ruleId}' and kind = any (array['spend_alert', 'spend_blocked']) and workspace_id = '${W1}'
    order by created_at desc, id desc limit 51`)).map((row) => row['QUERY PLAN']).join('\n');
  await db.exec('reset enable_seqscan');
  assert.match(plan, /email_outbox_spend_rule_events_idx/, 'history reads through the partial index');

  // ---- Soft-deleted rules are gone from preview and history.
  await db.query('update public.workspace_spend_rules set deleted_at = now() where id = $1', [high]);
  await assert.rejects(preview(high), /spend_rule_not_found/);
  await assert.rejects(history(high), /spend_rule_not_found/);

  // ---- Cap: the 51st live rule is refused, as the table's trigger decides.
  const live = await count('public.workspace_spend_rules where workspace_id = $1 and deleted_at is null', [W1]);
  for (let n = live; n < 50; n += 1) await save(W1, null, spend(`Filler ${n}`, 1 + n));
  await assert.rejects(save(W1, null, spend('Fifty-first', 1)), /spend_rule_limit_reached/);

  // ---- Test sends: five a minute per workspace, counted per workspace.
  const consume = async (workspace = W1, limit = 5) => (await one('select public.consume_spend_rule_test_send($1, $2) ok', [workspace, limit])).ok;
  await db.exec(`insert into public.workspace_spend_rule_test_sends values ('${W1}', now() - interval '2 days', 3)`);
  const results = [];
  for (let n = 0; n < 6; n += 1) results.push(await consume());
  assert.deepEqual(results, [true, true, true, true, true, false]);
  assert.equal(await consume(W2), true, 'another workspace has its own allowance');
  assert.equal(await count(`public.workspace_spend_rule_test_sends where bucket_start < now() - interval '1 day'`), 0, 'day-old counters are pruned');
  for (const limit of [0, 101, null]) await assert.rejects(consume(W1, limit), /invalid_spend_rule_test_send_limit/);

  console.log('spend rules API: ok');
} finally {
  await db.close();
}
