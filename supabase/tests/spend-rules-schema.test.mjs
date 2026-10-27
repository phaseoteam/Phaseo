// Standalone PostgreSQL regression test for the spend rules schema: the tables' per-metric
// constraints, same-workspace scope and destination references, the 50-rule cap, RLS,
// IANA time zone validation (rules and workspace_settings.billing_time_zone), and the three
// new routable notification kinds. Runs the whole migration on a minimal pre-migration schema.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/spend-rules-schema.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_spend_rules_schema.sql'));
assert(migrationName, 'the spend rules schema migration exists');
const migration = await read(`../migrations/${migrationName}`);
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const schemaFiles = [
  '../schemas/private/functions/is_valid_time_zone.sql',
  '../schemas/public/functions/validate_workspace_billing_time_zone.sql',
  '../schemas/public/functions/set_notification_event_destinations.sql',
  '../schemas/public/functions/enforce_workspace_spend_rule_limit.sql',
  '../schemas/public/functions/validate_workspace_spend_rule.sql',
  '../schemas/public/tables/workspace_spend_rules.sql',
  '../schemas/public/tables/workspace_spend_rule_destinations.sql',
  '../schemas/public/tables/workspace_spend_rule_state.sql',
  '../schemas/public/tables/workspace_spend_blocks.sql',
  '../schemas/public/tables/workspace_spend_rule_dirty.sql',
];
for (const file of schemaFiles) assert(normalize(migration).includes(normalize(await read(file))), `${file} is in the migration`);

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ws = id(1);
const other = id(2);
const alice = id(11); // member of ws
const bob = id(12); // member of other only
const keyA = id(21); // in ws
const keyB = id(22); // in other
const deptA = id(31);
const deptB = id(32);
const destA = id(41);
const destB = id(42);

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const rejects = (sql, pattern, message, params) => assert.rejects(db.query(sql, params), pattern, message);

try {
  // ---- The schema as it was before the migration, reduced to what it touches.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to authenticated, service_role;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to authenticated, anon;
    create table public.workspaces (id uuid primary key, owner_user_id uuid);
    create table public.workspace_members (workspace_id uuid not null references public.workspaces(id) on delete cascade, user_id uuid not null, role text not null default 'member', primary key (workspace_id, user_id));
    create table public.workspace_departments (id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade, constraint workspace_departments_id_workspace_id_key unique (id, workspace_id));
    create table public.keys (id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade);
    create table public.notification_destinations (id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade, status text not null default 'active');
    create table public.notification_event_destinations (
      workspace_id uuid not null, event_kind text not null, destination_id uuid not null,
      constraint notification_event_destinations_event_kind_check CHECK ((event_kind = ANY (ARRAY['low_balance'::text, 'auto_top_up_failed'::text, 'payment_method_expiring'::text, 'model_deprecation'::text, 'model_substitution'::text, 'rate_limit_throttled'::text]))),
      primary key (workspace_id, event_kind, destination_id));
    create table public.workspace_settings (workspace_id uuid primary key references public.workspaces(id) on delete cascade, department_spend_attribution text not null default 'all');
    alter table public.workspace_settings enable row level security;
    create policy team_settings_select_own_team on public.workspace_settings for select to authenticated using (true);
    create policy team_settings_update_own_team on public.workspace_settings for update to authenticated using (true) with check (true);
    grant select, update on public.workspace_settings to authenticated;
  `);
  await db.exec(await read('../schemas/public/functions/set_updated_at_if_changed.sql'));
  await db.exec(await read('../schemas/public/functions/is_workspace_member.sql'));
  await db.exec(`
    insert into auth.users values ('${alice}'), ('${bob}');
    insert into public.workspaces values ('${ws}', '${alice}'), ('${other}', '${bob}');
    insert into public.workspace_members values ('${ws}', '${alice}', 'owner'), ('${other}', '${bob}', 'owner');
    insert into public.workspace_departments values ('${deptA}', '${ws}'), ('${deptB}', '${other}');
    insert into public.keys values ('${keyA}', '${ws}'), ('${keyB}', '${other}');
    insert into public.notification_destinations values ('${destA}', '${ws}', 'active'), ('${destB}', '${other}', 'active');
    insert into public.workspace_settings (workspace_id) values ('${ws}'), ('${other}');
  `);

  // ---- The migration, whole.
  await db.exec(migration);

  // ---- billing_time_zone: defaults to UTC, accepts IANA names, rejects the rest.
  assert.deepEqual(await rows(`select distinct billing_time_zone from public.workspace_settings`), [{ billing_time_zone: 'UTC' }], 'existing workspaces get UTC');
  await db.query(`update public.workspace_settings set billing_time_zone = ' Europe/London ' where workspace_id = $1`, [ws]);
  assert.equal((await rows(`select billing_time_zone from public.workspace_settings where workspace_id = $1`, [ws]))[0].billing_time_zone, 'Europe/London', 'trimmed and stored');
  await db.query(`update public.workspace_settings set billing_time_zone = 'America/Argentina/Buenos_Aires' where workspace_id = $1`, [ws]);
  for (const bad of ['Mars/Olympus_Mons', 'europe/london', '+01:00', 'posix/Europe/London', 'localtime', '']) {
    await rejects(`update public.workspace_settings set billing_time_zone = $2 where workspace_id = $1`, /invalid_time_zone|billing_time_zone_check/, `billing zone ${JSON.stringify(bad)} is rejected`, [ws, bad]);
  }
  await rejects(`insert into public.workspace_settings (workspace_id, billing_time_zone) values ($1, 'Nowhere/City')`, /invalid_time_zone/, 'inserts are validated too', [id(3)]);
  // Admins write settings through RLS; the definer-rights trigger still reaches the private helper.
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${alice}', false);`);
  await db.query(`update public.workspace_settings set billing_time_zone = 'Asia/Tokyo' where workspace_id = $1`, [ws]);
  await rejects(`update public.workspace_settings set billing_time_zone = 'Asia/Nowhere' where workspace_id = $1`, /invalid_time_zone/, 'validated for authenticated writers', [ws]);
  await db.exec(`reset role`);

  // ---- Rules: one valid example of each metric.
  const insert = ({ name = 'Rule', ...values }, workspace = ws) => db.query(
    `insert into public.workspace_spend_rules (workspace_id, name, ${Object.keys(values).join(', ')}) values ($1, $2, ${Object.keys(values).map((_, i) => `$${i + 3}`).join(', ')}) returning *`,
    [workspace, name, ...Object.values(values)],
  ).then((result) => result.rows[0]);
  const spend = { metric: 'spend', period: 'month', threshold_amount_nanos: 100e9 };
  const budget = { metric: 'budget_percent', period: 'month', base_kind: 'amount', base_amount_nanos: 500e9, threshold_percents: '{100,50,80,80}' };
  const valid = [
    spend,
    { ...spend, action: 'block', block_at_amount_nanos: 120e9, scope_type: 'model', scope_id: 'openai/gpt-5' },
    budget,
    { ...budget, action: 'block', block_at_percent: 110 },
    { metric: 'budget_percent', period: 'week', base_kind: 'workspace_budget', base_ref: 'weekly', threshold_percents: '{75}', time_zone: 'Asia/Kolkata' },
    { metric: 'budget_percent', period: 'day', base_kind: 'key_limit', base_ref: 'daily', threshold_percents: '{90}', scope_type: 'key', scope_id: keyA.toUpperCase() },
    { metric: 'budget_percent', period: 'month', base_kind: 'previous_period', threshold_percents: '{120}', scope_type: 'department', scope_id: deptA },
    { metric: 'budget_percent', period: 'rolling', window_hours: 24, base_kind: 'amount', base_amount_nanos: 10e9, threshold_percents: '{100}', scope_type: 'member', scope_id: alice, cooldown_minutes: 60 },
    { metric: 'forecast', period: 'month', threshold_amount_nanos: 1000e9 },
    { metric: 'forecast', period: 'month', base_kind: 'workspace_budget', base_ref: 'monthly', threshold_percents: '{100}', scope_type: 'provider', scope_id: 'anthropic' },
    { metric: 'spike', period: 'rolling', window_hours: 1, spike_multiplier: 3, spike_floor_nanos: 5e9 },
    { metric: 'balance', period: 'rolling', window_hours: 168, threshold_amount_nanos: 20e9 },
    { metric: 'balance', period: 'rolling', window_hours: 168, runway_days: 7 },
  ];
  const created = [];
  for (const values of valid) created.push(await insert(values));
  assert.deepEqual(created[2].threshold_percents, [50, 80, 100], 'thresholds are stored sorted and distinct');
  assert.equal(created[2].block_at_percent, 110, 'block_at_percent defaults to 110');
  assert.equal(created[0].block_free_models, false, 'free models are not blocked by default');
  assert.equal(created[0].action, 'notify');
  assert.equal(created[0].enabled, true);
  assert.equal(created[0].cooldown_minutes, 360);
  assert.equal(created[0].time_zone, null, 'null time zone means the workspace default');
  assert.equal(created[5].scope_id, keyA, 'uuid scopes are lowercased');
  assert.equal(created[5].scope_key_id, keyA, 'the key scope fills scope_key_id');
  assert.equal(created[7].scope_user_id, alice);
  assert.equal(created[6].scope_department_id, deptA);
  assert.equal(created[1].scope_key_id, null, 'model scopes leave the typed ids null');

  // ---- Rules: each invalid shape fails on the constraint that names it.
  const invalid = [
    [{ ...spend, metric: 'cost' }, /workspace_spend_rules_metric_check/],
    [{ ...spend, period: 'year' }, /workspace_spend_rules_period_check/],
    [{ ...spend, period: 'rolling' }, /workspace_spend_rules_window_hours_check/],
    [{ ...spend, window_hours: 24 }, /workspace_spend_rules_window_hours_check/],
    [{ ...spend, period: 'rolling', window_hours: 721 }, /workspace_spend_rules_window_hours_check/],
    [{ ...spend, threshold_amount_nanos: null }, /workspace_spend_rules_spend_fields_check/],
    [{ ...spend, threshold_percents: '{50}' }, /workspace_spend_rules_spend_fields_check/],
    [{ ...spend, threshold_amount_nanos: 0 }, /workspace_spend_rules_threshold_amount_nanos_check/],
    [{ ...spend, action: 'block' }, /workspace_spend_rules_block_at_amount_check/],
    [{ ...spend, action: 'block', block_at_amount_nanos: 50e9 }, /workspace_spend_rules_block_at_amount_check/],
    [{ ...spend, block_at_amount_nanos: 150e9 }, /workspace_spend_rules_block_at_amount_check/],
    [{ ...spend, action: 'pause' }, /workspace_spend_rules_action_check/],
    [{ ...budget, threshold_percents: null }, /workspace_spend_rules_budget_percent_fields_check/],
    [{ ...budget, threshold_percents: '{}' }, /workspace_spend_rules_budget_percent_fields_check/],
    [{ ...budget, threshold_percents: '{10,20,30,40,50,60}' }, /workspace_spend_rules_threshold_percents_check/],
    [{ ...budget, threshold_percents: '{0,50}' }, /workspace_spend_rules_threshold_percents_check/],
    [{ ...budget, threshold_percents: '{50,NULL}' }, /workspace_spend_rules_threshold_percents_check/],
    [{ ...budget, threshold_percents: '{1001}' }, /workspace_spend_rules_threshold_percents_check/],
    [{ ...budget, base_kind: null, base_amount_nanos: null }, /workspace_spend_rules_budget_percent_fields_check/],
    [{ ...budget, base_amount_nanos: null }, /workspace_spend_rules_base_check/],
    [{ ...budget, base_kind: 'workspace_budget', base_amount_nanos: null, base_ref: 'weekly' }, /workspace_spend_rules_base_check/],
    [{ ...budget, base_kind: 'workspace_budget', base_amount_nanos: null, base_ref: 'lifetime' }, /workspace_spend_rules_base_check/],
    [{ ...budget, base_kind: 'key_limit', base_amount_nanos: null, base_ref: 'monthly' }, /workspace_spend_rules_base_check/],
    [{ ...budget, base_kind: 'guardrail_budget' }, /workspace_spend_rules_base_check/],
    [{ ...budget, action: 'block', block_at_percent: 90 }, /workspace_spend_rules_block_at_percent_check/],
    [{ ...budget, block_at_percent: 1001 }, /workspace_spend_rules_block_at_percent_check/],
    [{ ...budget, base_kind: 'previous_period', base_amount_nanos: null, action: 'block' }, /workspace_spend_rules_block_metric_check/],
    [{ metric: 'forecast', period: 'rolling', window_hours: 24, threshold_amount_nanos: 1e9 }, /workspace_spend_rules_forecast_fields_check/],
    [{ metric: 'forecast', period: 'month', threshold_amount_nanos: 1e9, base_kind: 'amount', base_amount_nanos: 1e9, threshold_percents: '{100}' }, /workspace_spend_rules_forecast_fields_check/],
    [{ metric: 'forecast', period: 'month', threshold_amount_nanos: 1e9, action: 'block' }, /workspace_spend_rules_block_metric_check|block_at_amount_check/],
    [{ metric: 'spike', period: 'day', spike_multiplier: 3, spike_floor_nanos: 5e9 }, /workspace_spend_rules_spike_fields_check/],
    [{ metric: 'spike', period: 'rolling', window_hours: 1, spike_floor_nanos: 5e9 }, /workspace_spend_rules_spike_fields_check/],
    [{ metric: 'spike', period: 'rolling', window_hours: 1, spike_multiplier: 1, spike_floor_nanos: 5e9 }, /workspace_spend_rules_spike_check/],
    [{ ...spend, spike_multiplier: 3 }, /workspace_spend_rules_spend_fields_check/],
    [{ metric: 'balance', period: 'rolling', window_hours: 168 }, /workspace_spend_rules_balance_fields_check/],
    [{ metric: 'balance', period: 'month', threshold_amount_nanos: 1e9 }, /workspace_spend_rules_balance_fields_check/],
    [{ metric: 'balance', period: 'rolling', window_hours: 168, runway_days: 7, scope_type: 'key', scope_id: keyA }, /workspace_spend_rules_balance_fields_check/],
    [{ metric: 'balance', period: 'rolling', window_hours: 168, runway_days: 366 }, /workspace_spend_rules_runway_days_check/],
    [{ ...spend, runway_days: 7 }, /workspace_spend_rules_spend_fields_check/],
    [{ ...spend, cooldown_minutes: 1 }, /workspace_spend_rules_cooldown_minutes_check/],
    [{ ...spend, name: '   ' }, /workspace_spend_rules_name_check/],
    [{ ...spend, scope_type: 'team', scope_id: 'x' }, /workspace_spend_rules_scope_check/],
    [{ ...spend, scope_id: 'openai/gpt-5' }, /workspace_spend_rules_scope_check/],
    [{ ...spend, scope_type: 'model' }, /workspace_spend_rules_scope_check/],
    [{ ...spend, scope_type: 'key', scope_id: 'not-a-uuid' }, /invalid_spend_rule_scope_id/],
    [{ ...spend, scope_type: 'member' }, /invalid_spend_rule_scope_id/],
    // Scope ids must be in the rule's workspace (composite foreign keys).
    [{ ...spend, scope_type: 'key', scope_id: keyB }, /workspace_spend_rules_key_fkey/],
    [{ ...spend, scope_type: 'key', scope_id: id(99) }, /workspace_spend_rules_key_fkey/],
    [{ ...spend, scope_type: 'member', scope_id: bob }, /workspace_spend_rules_member_fkey/],
    [{ ...spend, scope_type: 'department', scope_id: deptB }, /workspace_spend_rules_department_fkey/],
    // Time zones.
    [{ ...spend, time_zone: 'Mars/Olympus_Mons' }, /invalid_time_zone/],
    [{ ...spend, time_zone: 'right/UTC' }, /invalid_time_zone/],
  ];
  for (const [values, pattern] of invalid) {
    await assert.rejects(insert(values), pattern, `rejects ${JSON.stringify(values)}`);
  }
  assert.equal((await insert({ ...spend, time_zone: '  ' })).time_zone, null, 'a blank zone means the workspace default');

  // Rules stay in their workspace.
  await rejects(`update public.workspace_spend_rules set workspace_id = $1 where id = $2`, /spend_rule_workspace_immutable/, 'workspace_id is fixed', [other, created[0].id]);

  // ---- Destinations: both ids in the same workspace.
  await db.query(`insert into public.workspace_spend_rule_destinations (rule_id, destination_id, workspace_id) values ($1, $2, $3)`, [created[0].id, destA, ws]);
  await rejects(`insert into public.workspace_spend_rule_destinations (rule_id, destination_id, workspace_id) values ($1, $2, $3)`, /workspace_spend_rule_destinations_destination_fkey/, 'another workspace\'s destination', [created[2].id, destB, ws]);
  await rejects(`insert into public.workspace_spend_rule_destinations (rule_id, destination_id, workspace_id) values ($1, $2, $3)`, /workspace_spend_rule_destinations_rule_fkey/, 'a rule claimed by another workspace', [created[2].id, destB, other]);

  // ---- State: one row per rule and period; cooldown rules use -infinity.
  await db.query(`insert into public.workspace_spend_rule_state (rule_id, workspace_id, period_start, period_end, highest_percent_fired, last_fired_at, fire_count) values ($1, $2, '2026-10-01Z', '2026-11-01Z', 80, now(), 2)`, [created[2].id, ws]);
  await db.query(`insert into public.workspace_spend_rule_state (rule_id, workspace_id, period_start, last_fired_at, armed) values ($1, $2, '-infinity', now(), false)`, [created[11].id, ws]);
  await rejects(`insert into public.workspace_spend_rule_state (rule_id, workspace_id, period_start) values ($1, $2, '2026-10-01Z')`, /workspace_spend_rule_state_pkey/, 'one row per period', [created[2].id, ws]);
  await rejects(`insert into public.workspace_spend_rule_state (rule_id, workspace_id, period_start, period_end) values ($1, $2, '2026-11-01Z', '2026-10-01Z')`, /workspace_spend_rule_state_period_check/, 'periods end after they start', [created[2].id, ws]);

  // ---- Blocks: one active block per rule; manual lifts carry who lifted.
  const block = `insert into public.workspace_spend_blocks (workspace_id, rule_id, scope_type, scope_id, period_start, resets_at, spend_nanos, limit_nanos) values ($1, $2, 'workspace', null, '2026-10-01Z', '2026-11-01Z', 560000000000, 550000000000) returning id`;
  const [{ id: blockId }] = await rows(block, [ws, created[3].id]);
  await rejects(block, /workspace_spend_blocks_active_rule_uidx/, 'one active block per rule', [ws, created[3].id]);
  await rejects(`update public.workspace_spend_blocks set lifted_at = now() where id = $1`, /workspace_spend_blocks_lift_check/, 'a lift needs a reason', [blockId]);
  await rejects(`update public.workspace_spend_blocks set lifted_at = now(), lift_reason = 'period_reset', lifted_by = $2 where id = $1`, /workspace_spend_blocks_lift_check/, 'only manual lifts have a lifter', [blockId, alice]);
  await rejects(`update public.workspace_spend_blocks set lifted_by = $2 where id = $1`, /workspace_spend_blocks_lift_check/, 'an active block has no lifter', [blockId, alice]);
  await db.query(`update public.workspace_spend_blocks set lifted_at = now(), lift_reason = 'manual', lifted_by = $2 where id = $1`, [blockId, alice]);
  await rows(block, [ws, created[3].id]);
  await rejects(`insert into public.workspace_spend_blocks (workspace_id, scope_type, scope_id, period_start, spend_nanos, limit_nanos) values ($1, 'key', null, now(), 1, 1)`, /workspace_spend_blocks_scope_check/, 'block scopes match rule scopes', [ws]);

  // ---- Deletes: removing a key removes its rules; hard-deleting a rule keeps its block history.
  const keyRule = created[5].id;
  await db.query(`delete from public.keys where id = $1`, [keyA]);
  assert.equal((await rows(`select count(*)::int n from public.workspace_spend_rules where id = $1`, [keyRule]))[0].n, 0, 'key rules go with the key');
  await db.query(`delete from public.workspace_spend_rules where id = $1`, [created[3].id]);
  assert.deepEqual(await rows(`select count(*)::int n, count(rule_id)::int with_rule from public.workspace_spend_blocks`), [{ n: 2, with_rule: 0 }], 'blocks outlive their rule');

  // ---- The 50-rule cap counts non-deleted rules per workspace.
  const live = async (workspace) => (await rows(`select count(*)::int n from public.workspace_spend_rules where workspace_id = $1 and deleted_at is null`, [workspace]))[0].n;
  for (let n = await live(ws); n < 50; n += 1) await insert({ ...spend, name: `Cap ${n}` });
  assert.equal(await live(ws), 50);
  await assert.rejects(insert(spend), /spend_rule_limit_reached/, 'the 51st rule is refused');
  await insert(spend, other);
  const [{ id: capped }] = await rows(`select id from public.workspace_spend_rules where workspace_id = $1 and deleted_at is null order by created_at limit 1`, [ws]);
  await db.query(`update public.workspace_spend_rules set deleted_at = now() where id = $1`, [capped]);
  const replacement = await insert({ ...spend, name: 'Replacement' });
  await rejects(`update public.workspace_spend_rules set deleted_at = null where id = $1`, /spend_rule_limit_reached/, 'restoring a rule counts toward the cap', [capped]);
  await db.query(`update public.workspace_spend_rules set name = 'Renamed', enabled = false where id = $1`, [replacement.id]);

  // ---- Notification kinds: routable through the setter and the CHECK.
  for (const kind of ['spend_alert', 'spend_blocked', 'spend_report']) {
    await db.query(`select public.set_notification_event_destinations($1, $2, array[$3]::uuid[])`, [ws, kind, destA]);
  }
  assert.deepEqual((await rows(`select event_kind from public.notification_event_destinations order by event_kind`)).map((row) => row.event_kind), ['spend_alert', 'spend_blocked', 'spend_report']);
  await rejects(`select public.set_notification_event_destinations($1, 'spend_alerts', array[]::uuid[])`, /invalid_notification_event_kind/, 'unknown kinds are refused', [ws]);
  await rejects(`insert into public.notification_event_destinations values ($1, 'spend_alerts', $2)`, /notification_event_destinations_event_kind_check/, 'the CHECK lists the new kinds only', [ws, destA]);

  // ---- RLS: members read their workspace's live rules, blocks, state and destinations; nobody writes directly.
  await db.exec(`insert into public.workspace_spend_rule_dirty (workspace_id) values ('${ws}')`);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${alice}', false);`);
  const visible = await rows(`select workspace_id, count(*)::int n, count(deleted_at)::int deleted from public.workspace_spend_rules group by workspace_id`);
  assert.deepEqual(visible, [{ workspace_id: ws, n: 50, deleted: 0 }], 'members see their own workspace\'s non-deleted rules');
  assert.equal((await rows(`select count(*)::int n from public.workspace_spend_blocks`))[0].n, 2);
  assert.equal((await rows(`select count(*)::int n from public.workspace_spend_rule_state`))[0].n, 2);
  assert.equal((await rows(`select count(*)::int n from public.workspace_spend_rule_destinations`))[0].n, 1);
  await rejects(`insert into public.workspace_spend_rules (workspace_id, name, metric, period, threshold_amount_nanos) values ($1, 'x', 'spend', 'month', 1)`, /permission denied/, 'members cannot insert', [ws]);
  await rejects(`update public.workspace_spend_rules set enabled = false`, /permission denied/, 'members cannot update');
  await rejects(`delete from public.workspace_spend_blocks`, /permission denied/, 'members cannot lift blocks directly');
  await rejects(`select * from public.workspace_spend_rule_dirty`, /permission denied/, 'the dirty set is service-only');
  await db.exec(`select set_config('request.jwt.claim.sub', '${bob}', false);`);
  assert.deepEqual(await rows(`select workspace_id, count(*)::int n from public.workspace_spend_rules group by workspace_id`), [{ workspace_id: other, n: 1 }], 'other workspaces are invisible');
  assert.equal((await rows(`select count(*)::int n from public.workspace_spend_blocks`))[0].n, 0);
  await db.exec(`reset role; set role anon;`);
  await rejects(`select * from public.workspace_spend_rules`, /permission denied/, 'anon reads nothing');
  await db.exec(`reset role; set role service_role;`);
  assert.equal((await rows(`select count(*)::int n from public.workspace_spend_rules`))[0].n > 50, true, 'the service role sees every rule');
  await db.exec(`reset role`);

  console.log('spend rules schema: ok');
} finally {
  await db.close();
}
