// Standalone PostgreSQL regression test for spike spend rules.
// A spike rule compares spend over its last window_hours with the median of the same window over
// the previous 7 days (the same hours on each of the 7 days before for windows under 24 hours,
// else the non-overlapping windows that fit in 7 days, at least 3), and fires at
// spike_multiplier x the median and spike_floor_nanos, at most once per cooldown_minutes (state
// row '-infinity'). It waits until the workspace has spent in at least 3 baseline windows.
// Windows are counted in hours, so a time zone never changes the result.
// Runs the spend rules migrations whole on a minimal pre-migration schema, and prints the
// evaluator's cost per workspace with and without spike rules, and for 50 spike rules.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/spend-rules-spike.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
const find = (suffix) => migrations.find((name) => name.endsWith(suffix));
const stack = ['_spend_rules_schema.sql', '_spend_rules_evaluator.sql', '_spend_rules_api.sql', '_spend_rule_blocks.sql',
  '_spend_rules_balance.sql', '_spend_rules_forecast.sql', '_spend_rules_spike.sql'].map(find);
assert(stack.every(Boolean), 'the spend rules migrations exist');
const migrationName = stack[6];
assert(migrationName > stack[5], 'the spike migration runs after the forecast migration');
const migration = await read(`../migrations/${migrationName}`);
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();

// ---- The migration carries the schema files, CI runs this suite.
const redefined = [
  'private/functions/spend_rule_evaluable.sql',
  'private/functions/spend_spike_rule_values.sql',
  'private/functions/spend_spike_alert_text.sql',
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
assert.doesNotMatch(migration, /FUNCTION public.sweep_spend_rules/, 'the sweep is unchanged: spike rules stay in its periodic pass');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/spend-rules-spike\.test\.mjs/, 'CI runs this suite');
const exported = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of ['private/functions/spend_spike_rule_values.sql', 'private/functions/spend_spike_alert_text.sql']) {
  assert(exported.loadOrder.includes(file) && exported.files.includes(file), `${file} is in the declarative export`);
}

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(11);
const DOLLAR = 1e9;
const nanos = (dollars) => Math.round(dollars * DOLLAR);
const HOUR = 3_600_000;
const at = (base, hours) => new Date(Date.parse(base) + hours * HOUR).toISOString();
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
    create index gateway_requests_async_spend_idx on public.gateway_requests (workspace_id, created_at) include (key_id, cost_nanos)
      where success is true and endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime']);
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
  const functions = ['spend_rule_evaluable', 'spend_spike_rule_values', 'spend_spike_alert_text', 'evaluate_workspace_spend_rules',
    'preview_workspace_spend_rule', 'sweep_spend_rules'];
  const grants = await rows(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') authenticated, has_function_privilege('service_role', p.oid, 'execute') service
    from pg_proc p where p.proname = any($1)`, [functions]);
  assert.equal(grants.length, functions.length, 'one definition of each');
  for (const grant of grants) {
    assert.equal(grant.anon, false, `${grant.proname}: anon`);
    assert.equal(grant.authenticated, false, `${grant.proname}: authenticated`);
    assert.equal(grant.service, true, `${grant.proname}: service_role`);
  }
  assert.deepEqual((await rows(`select private.spend_rule_evaluable(m, p, b) ok from (values
    ('spike', 'rolling', null), ('spike', 'day', null), ('spike', 'rolling', 'amount'), ('balance', 'rolling', null),
    ('forecast', 'month', null), ('spend', 'rolling', null)) v(m, p, b)`)).map((r) => r.ok),
  [true, false, false, true, true, true], 'spike rules are evaluated (rolling, no base); the others are unchanged');

  await db.exec(`
    insert into auth.users values ('${owner}', 'owner@example.com', '{}');
    insert into public.v2_models values ('openai/gpt-5', 'GPT-5'), ('anthropic/claude', 'Claude');
    insert into public.v2_model_provider_routes values ('route-gpt', 'openai/gpt-5', 'openai'), ('route-claude', 'anthropic/claude', 'anthropic');
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
  const addKey = async ({ ws }, name) => {
    const key = id(nextWorkspace++);
    await db.query('insert into public.keys (id, workspace_id, name, created_by) values ($1, $2, $3, $4)', [key, ws, name, owner]);
    return key;
  };
  const addUsage = async ({ ws, key }, costNanos, bucket, { keyId = key, model = 'openai/gpt-5', route = 'route-gpt' } = {}) => db.query(
    `insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, actor_user_id, requests, successful_requests, cost_nanos)
      values ($1, $2, $3, $4, $5, $6, 1, 1, $7)
      on conflict (workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok, actor_user_id)
      do update set cost_nanos = public.v2_private_usage_15m.cost_nanos + excluded.cost_nanos`, [ws, bucket, model, route, keyId, owner, costNanos]);
  const rule = async ({ ws }, values) => (await one(
    `insert into public.workspace_spend_rules (workspace_id, ${Object.keys(values).join(', ')})
     values ($1, ${Object.keys(values).map((_, i) => `$${i + 2}`).join(', ')}) returning id`,
    [ws, ...Object.values(values)])).id;
  const spikeRule = (w, values) => rule(w, { name: 'Spike', metric: 'spike', period: 'rolling', window_hours: 3,
    spike_multiplier: 3, spike_floor_nanos: nanos(5), ...values });
  const spikeValues = async ({ ws }, now, ruleId = null) => rows('select * from private.spend_spike_rule_values($1, $2::timestamptz, $3)', [ws, now, ruleId]);
  const evaluate = async ({ ws }, now, blocks = false) => (await one('select private.evaluate_workspace_spend_rules($1, $2::timestamptz, $3) r', [ws, now, blocks])).r;
  const preview = async ({ ws }, ruleId, now) => (await one('select public.preview_workspace_spend_rule($1, $2, $3::timestamptz) p', [ws, ruleId, now])).p;
  const alerts = async (ruleId) => rows(`select payload, dedupe_key, subject from public.email_outbox
    where kind = 'spend_alert' and payload ->> 'rule_id' = $1 order by created_at, dedupe_key`, [ruleId]);
  const states = async (ruleId) => rows(`select period_start::text period_start, period_end, last_fired_at, fire_count, last_value_nanos, last_base_nanos
    from public.workspace_spend_rule_state where rule_id = $1 order by period_start`, [ruleId]);
  // Spend in the 3 hours before `now` on each of the 7 days before, one amount per day.
  const history = async (w, now, perDay, options) => {
    for (const [index, dollars] of perDay.entries()) {
      if (dollars) await addUsage(w, nanos(dollars), at(now, -24 * (index + 1) - 2), options);
    }
  };

  // ---- Firing: 4.2x the median (not the mean) of the same 3 hours on the 7 days before.
  const NOW = '2026-10-21T13:00:00Z';
  {
    const w = await workspace();
    const S1 = await spikeRule(w, { name: 'Afternoon spike' });
    // Days 1..7 before: 5, 8, 10, 10, 12, 50, 9 → median 10 (the mean would be 14.86).
    await history(w, NOW, [5, 8, 10, 10, 12, 50, 9]);
    // Just outside the baseline windows: the hour after each window and the hour before it.
    await addUsage(w, nanos(500), at(NOW, -24));
    await addUsage(w, nanos(500), at(NOW, -24 - 3.25));
    await addUsage(w, nanos(29.9), at(NOW, -2));
    let [row] = await spikeValues(w, NOW);
    assert.equal(Number(row.current_nanos), nanos(29.9));
    assert.equal(Number(row.baseline_nanos), nanos(10), 'the median of the 7 windows');
    assert.equal(row.baseline_windows, 7);
    assert.equal(row.active_windows, 7);
    assert.equal(row.history_ready, true);
    assert.equal(Number(row.fires_at_nanos), nanos(30), '3x $10');
    assert.equal(row.spiking, false, '$29.90 is under 3x');
    assert.equal((await evaluate(w, NOW)).fired, 0);
    let shown = await preview(w, S1, NOW);
    assert.equal(shown.evaluated, true);
    assert.equal(shown.period.kind, 'rolling');
    assert.equal(shown.period.window_hours, 3);
    assert.equal(ms(shown.period.start), '2026-10-21T10:00:00.000Z');
    assert.equal(Number(shown.value_nanos), nanos(29.9));
    assert.equal(Number(shown.base_nanos), nanos(10));
    assert.equal(Number(shown.next_threshold.amount_nanos), nanos(30), 'the next threshold is the point it fires at');
    assert.equal(shown.spike.spiking, false);
    assert.equal(Number(shown.spike.multiple), 2.99);
    assert.equal(shown.spike.history_ready, true);

    await addUsage(w, nanos(12.2), at(NOW, -0.25));
    [row] = await spikeValues(w, NOW);
    assert.equal(row.spiking, true);
    const result = await evaluate(w, NOW);
    assert.equal(result.rules, 1);
    assert.equal(result.fired, 1);
    assert.equal(result.state_rows, 1);
    assert.equal(result.events[0].trigger, 'spike');
    assert.equal(Number(result.events[0].threshold), 3, 'the sweep event names the multiplier');
    const [alert] = await alerts(S1);
    assert.equal(alert.subject, 'Afternoon spike: spend 4.2× usual in the last 3 hours');
    assert.equal(alert.payload.message, 'Spend in the last 3 hours is $42.10, 4.2× your usual $10.00 for this time of day. '
      + 'The usual is the median of the same 3 hours on each of the previous 7 days. Alerts at 3× and $5.00 or more.');
    assert.equal(alert.payload.metric, 'spike');
    assert.equal(Number(alert.payload.value_nanos), nanos(42.1));
    assert.equal(Number(alert.payload.base_nanos), nanos(10));
    assert.equal(Number(alert.payload.spike.multiple), 4.21);
    assert.equal(alert.payload.spike.floor_only, false);
    assert.equal(alert.payload.period.window_hours, 3);
    assert.equal(alert.payload.cooldown_minutes, 360);
    assert.equal(alert.payload.push.href, '/settings/notifications');
    assert.match(alert.dedupe_key, new RegExp(`^spend_alert:${S1}:cooldown:\\d+:spike$`));
    const [state] = await states(S1);
    assert.equal(state.period_start, '-infinity');
    assert.equal(state.fire_count, 1);
    assert.equal(Number(state.last_value_nanos), nanos(42.1));
    assert.equal(Number(state.last_base_nanos), nanos(10));
    shown = await preview(w, S1, NOW);
    assert.equal(shown.alert.message, alert.payload.message, 'the preview carries the same text');
    assert.equal(shown.next_threshold, null, 'spiking: nothing next');
    assert.equal(ms(shown.spike.cooldown_until), '2026-10-21T19:00:00.000Z');
    assert.equal(shown.state.fire_count, 1);
  }

  // ---- The floor: 4x a $1 median is $4, under the $5 floor.
  {
    const w = await workspace();
    const S2 = await spikeRule(w, { name: 'Floor' });
    await history(w, NOW, [1, 1, 1, 1, 1, 1, 1]);
    await addUsage(w, nanos(4), at(NOW, -1));
    let [row] = await spikeValues(w, NOW);
    assert.equal(Number(row.multiple), 4);
    assert.equal(Number(row.fires_at_nanos), nanos(5), 'the floor is the larger');
    assert.equal(row.spiking, false);
    assert.equal((await evaluate(w, NOW)).fired, 0, 'over 3x but under the floor');
    await addUsage(w, nanos(1.5), at(NOW, -0.5));
    [row] = await spikeValues(w, NOW);
    assert.equal(row.spiking, true);
    assert.equal((await evaluate(w, NOW)).fired, 1, '$5.50: over 3x and the floor');
    void S2;
  }

  // ---- A zero baseline: a new key in an established workspace fires on the floor alone.
  {
    const w = await workspace();
    await history(w, NOW, [3, 3, 3, 3, 3, 0, 0]);
    const fresh = await addKey(w, 'leaked');
    const S3 = await spikeRule(w, { name: 'Key spike', scope_type: 'key', scope_id: fresh });
    await addUsage(w, nanos(4.99), at(NOW, -1), { keyId: fresh });
    let [row] = await spikeValues(w, NOW);
    assert.equal(Number(row.baseline_nanos), 0, 'the key never spent in these hours');
    assert.equal(row.multiple, null);
    assert.equal(row.active_windows, 5, 'the workspace did');
    assert.equal(row.history_ready, true);
    assert.equal(row.spiking, false, 'under the floor');
    await addUsage(w, nanos(2.01), at(NOW, -0.5), { keyId: fresh });
    assert.equal((await evaluate(w, NOW)).fired, 1);
    const [alert] = await alerts(S3);
    assert.equal(alert.subject, 'Key spike: $7.00 spent in the last 3 hours');
    assert.equal(alert.payload.message, "Spend by API key 'leaked' in the last 3 hours is $7.00. There was no spend in the same 3 hours "
      + 'on the previous 7 days, so this alert uses only the $5.00 floor.');
    assert.equal(alert.payload.spike.floor_only, true);
    assert.equal(alert.payload.scope.key_id, fresh);

    // The same zero baseline with a floor of 0 still needs some spend.
    const S3b = await spikeRule(w, { name: 'No floor', scope_type: 'model', scope_id: 'anthropic/claude', spike_floor_nanos: 0 });
    [row] = await spikeValues(w, NOW, S3b);
    assert.equal(row.spiking, false, 'no spend on the model: nothing to report');
    await addUsage(w, nanos(0.2), at(NOW, -1), { model: 'anthropic/claude', route: 'route-claude' });
    [row] = await spikeValues(w, NOW, S3b);
    assert.equal(row.spiking, true);
  }

  // ---- Short history: spend in only 2 of the 7 baseline windows waits; a third makes it ready.
  {
    const w = await workspace();
    const S4 = await spikeRule(w, { name: 'New workspace' });
    await history(w, NOW, [2, 2, 0, 0, 0, 0, 0]);
    await addUsage(w, nanos(100), at(NOW, -1));
    let [row] = await spikeValues(w, NOW);
    assert.equal(row.active_windows, 2);
    assert.equal(row.history_ready, false);
    assert.equal(row.spiking, false);
    assert.equal((await evaluate(w, NOW)).fired, 0, 'too little history');
    const shown = await preview(w, S4, NOW);
    assert.equal(shown.spike.history_ready, false);
    assert.equal(shown.next_threshold, null, 'nothing to aim at yet');
    assert(shown.alert, 'the text still shows');
    // Spend outside the windows does not count as history.
    await addUsage(w, nanos(9), at(NOW, -24 * 3 - 6));
    assert.equal((await spikeValues(w, NOW))[0].active_windows, 2);
    await addUsage(w, nanos(2), at(NOW, -24 * 3 - 1));
    [row] = await spikeValues(w, NOW);
    assert.equal(row.active_windows, 3);
    assert.equal(Number(row.baseline_nanos), 0, 'median of 2, 2, 2, 0, 0, 0, 0');
    assert.equal((await evaluate(w, NOW)).fired, 1, 'ready: the floor alone');
  }

  // ---- Cooldown: once per cooldown_minutes while spiking; again once it ends.
  {
    const w = await workspace();
    const S5 = await spikeRule(w, { name: 'Cooldown', window_hours: 1, cooldown_minutes: 120 });
    // $2 in each of the hours from 12:00 to 16:00 on the 7 days before.
    for (let day = 1; day <= 7; day += 1) for (const hour of [-1, 0, 1, 2]) await addUsage(w, nanos(2), at(NOW, -24 * day + hour + 0.25));
    await addUsage(w, nanos(10), at(NOW, -0.5));
    assert.equal((await evaluate(w, NOW)).fired, 1, '$10 vs $2');
    await addUsage(w, nanos(10), at(NOW, 0.5));
    let result = await evaluate(w, at(NOW, 1));
    assert.equal(result.fired, 0, 'still spiking within the cooldown');
    assert.equal(result.state_rows, 0, 'a quiet re-evaluation writes nothing');
    await addUsage(w, nanos(2), at(NOW, 1.75));
    result = await evaluate(w, at(NOW, 2));
    assert.equal(result.fired, 0, '$2 vs $2: no spike after the cooldown either');
    await addUsage(w, nanos(15), at(NOW, 2.25));
    result = await evaluate(w, at(NOW, 2.5));
    assert.equal(result.fired, 1, 'a new spike after the cooldown');
    const sent = await alerts(S5);
    assert.equal(sent.length, 2);
    assert.notEqual(sent[0].dedupe_key, sent[1].dedupe_key);
    assert.equal(sent[0].subject, 'Cooldown: spend 5× usual in the last hour');
    const [state] = await states(S5);
    assert.equal(state.fire_count, 2);
    assert.equal(ms(state.last_fired_at), at(NOW, 2.5));
    assert.equal((await rows('select count(*)::int n from public.workspace_spend_rule_state where rule_id = $1', [S5]))[0].n, 1, 'one -infinity row');
  }

  // ---- Time zones do not matter: a rolling window is counted in hours, even across a DST change.
  {
    // US clocks went back on Nov 1 2026; Nov 2 15:00 UTC compared with the 7 days before.
    const now = '2026-11-02T15:00:00Z';
    const results = [];
    for (const zone of [null, 'America/New_York', 'Pacific/Kiritimati']) {
      const w = await workspace('Zoned', zone === 'Pacific/Kiritimati' ? 'Asia/Kolkata' : null);
      const S6 = await spikeRule(w, { name: 'Zoned', ...(zone ? { time_zone: zone } : {}) });
      await history(w, now, [4, 6, 5, 7, 3, 5, 6]);
      await addUsage(w, nanos(20), at(now, -2));
      const [row] = await spikeValues(w, now);
      results.push([Number(row.current_nanos), Number(row.baseline_nanos), Number(row.multiple), row.spiking, ms(row.period_start)]);
      const result = await evaluate(w, now);
      assert.equal(result.fired, 1, `${zone ?? 'UTC'}: fires`);
      const [alert] = await alerts(S6);
      assert.equal(alert.payload.period.time_zone, zone ?? 'UTC', 'the zone is only reported');
    }
    assert.deepEqual(results[1], results[0], 'New York = UTC');
    assert.deepEqual(results[2], results[0], 'Kiritimati = UTC');
    assert.deepEqual(results[0], [nanos(20), nanos(5), 4, true, '2026-11-02T12:00:00.000Z']);
  }

  // ---- Windows of 24 hours or more: the non-overlapping windows that fit in 7 days.
  {
    const w = await workspace();
    const day = await spikeRule(w, { name: 'Day', window_hours: 24 });
    const twoDays = await spikeRule(w, { name: 'Two days', window_hours: 48 });
    const tooLong = await spikeRule(w, { name: 'Three days', window_hours: 72 });
    for (let hours = 1; hours <= 24 * 7; hours += 12) await addUsage(w, nanos(1), at(NOW, -hours - 0.25));
    await addUsage(w, nanos(30), at(NOW, -1));
    const byId = Object.fromEntries((await spikeValues(w, NOW)).map((row) => [row.id, row]));
    assert.equal(byId[day].baseline_windows, 7);
    assert.equal(Number(byId[day].baseline_nanos), nanos(2), 'two $1 buckets a day');
    assert.equal(byId[twoDays].baseline_windows, 3, '168 / 48');
    assert.equal(Number(byId[twoDays].baseline_nanos), nanos(4));
    assert.equal(byId[tooLong].baseline_windows, 2, 'only 2 windows of 72 hours fit in 7 days');
    assert.equal(byId[tooLong].history_ready, false, 'never ready');
    const result = await evaluate(w, NOW);
    assert.equal(result.fired, 2, 'the 24- and 48-hour rules fire, the 72-hour rule cannot');
    const [alert] = await alerts(twoDays);
    assert.equal(alert.payload.message, 'Spend in the last 48 hours is $34.00, 8.5× your usual $4.00 for 48 hours. '
      + 'The usual is the median of the previous 3 windows of 48 hours. Alerts at 3× and $5.00 or more.');
    const shown = await preview(w, tooLong, NOW);
    assert.equal(shown.spike.baseline_windows, 2);
    assert.equal(shown.alert, null, 'no text without a baseline');
  }

  // ---- Scopes: async jobs count, and a department sees its members' spend.
  {
    const w = await workspace();
    const dept = id(nextWorkspace++);
    await db.query(`insert into public.workspace_departments values ($1, $2, 'Research')`, [dept, w.ws]);
    await db.query(`insert into public.workspace_department_grants (workspace_id, user_id, department_id) values ($1, $2, $3)`, [w.ws, owner, dept]);
    const S7 = await spikeRule(w, { name: 'Research', scope_type: 'department', scope_id: dept });
    const S8 = await spikeRule(w, { name: 'OpenAI', scope_type: 'provider', scope_id: 'openai' });
    await history(w, NOW, [2, 2, 2, 2, 2, 2, 2]);
    await db.query(`insert into public.gateway_requests (created_at, workspace_id, key_id, endpoint, success, cost_nanos, model_id, provider)
      values ($1, $2, $3, 'video.generation', true, $4, 'openai/sora', 'openai')`, [at(NOW, -1), w.ws, w.key, nanos(9)]);
    const byId = Object.fromEntries((await spikeValues(w, NOW)).map((row) => [row.id, row]));
    assert.equal(Number(byId[S7].current_nanos), nanos(9), 'the video job counts for the department');
    assert.equal(Number(byId[S8].current_nanos), nanos(9), 'and for its provider');
    assert.equal(Number(byId[S7].baseline_nanos), nanos(2));
    assert.equal((await evaluate(w, NOW)).fired, 2);
    const [alert] = await alerts(S7);
    assert.match(alert.payload.message, /^Spend by department 'Research' in the last 3 hours is \$9\.00, 4\.5× its usual \$2\.00/);
  }

  // ---- Disabled and deleted rules are not evaluated; a disabled one still previews.
  {
    const w = await workspace();
    const off = await spikeRule(w, { name: 'Off', enabled: false });
    const gone = await spikeRule(w, { name: 'Gone' });
    await db.query('update public.workspace_spend_rules set deleted_at = now() where id = $1', [gone]);
    await history(w, NOW, [1, 1, 1, 1, 1, 1, 1]);
    await addUsage(w, nanos(50), at(NOW, -1));
    const result = await evaluate(w, NOW);
    assert.equal(result.rules, 0);
    assert.equal(result.fired, 0);
    assert.equal((await preview(w, off, NOW)).spike.spiking, true);
    await assert.rejects(preview(w, gone, NOW), /spend_rule_not_found/);
  }

  // ---- The sweep: spike rules are evaluated on dirty ticks and in the periodic pass. Both windows
  // move with p_now, so a rule can start spiking without new usage (an old baseline window ages
  // out, or a cooldown ends while spend is still high).
  {
    const w = await workspace('Spike only');
    const S9 = await spikeRule(w, { name: 'Only spike' });
    await history(w, NOW, [1, 1, 1, 1, 1, 1, 1]);
    await addUsage(w, nanos(20), at(NOW, -1));
    // A p_now in the workspace's periodic slot (the sweep's own hash), within the hour after NOW.
    const { slot } = await one('select ((hashtextextended($1::text, 0) % 12 + 12) % 12)::int slot', [w.ws]);
    const tick = Math.floor(Date.parse(NOW) / 300_000);
    const now = new Date((tick + (((slot - (tick % 12)) % 12) + 12) % 12) * 300_000).toISOString();
    assert.equal((await spikeValues(w, now))[0].spiking, true, 'an evaluation would fire');
    await db.exec('delete from public.workspace_spend_rule_dirty');
    const sweep = (await one('select public.sweep_spend_rules($1::timestamptz, 1000, false) r', [now])).r;
    assert.equal(sweep.dirty, 0, 'no new usage');
    assert(sweep.periodic >= 1, 'a spike-only workspace is in its periodic slot');
    assert.equal((await alerts(S9)).length, 1, 'the periodic pass fires it without new usage');
    assert(sweep.events.some((event) => event.rule_id === S9 && event.trigger === 'spike' && event.workspace_id === w.ws));
  }

  // ---- Cost: 50 spike rules in one workspace (8 days of 15-minute usage over 4 keys and 2 models).
  const bench = async (w, days) => {
    const keys = [w.key, await addKey(w, 'k2'), await addKey(w, 'k3'), await addKey(w, 'k4')];
    const start = Date.parse(NOW) - days * 24 * HOUR;
    const values = [];
    for (let t = start; t < Date.parse(NOW); t += HOUR / 4) {
      for (const [i, keyId] of keys.entries()) {
        const model = i % 2 ? ['anthropic/claude', 'route-claude'] : ['openai/gpt-5', 'route-gpt'];
        values.push(`('${w.ws}', '${new Date(t).toISOString()}', '${model[0]}', '${model[1]}', '${keyId}', '${owner}', 1, 1, ${1_000_000 + (t / 60_000) % 997})`);
      }
    }
    for (let i = 0; i < values.length; i += 2000) {
      await db.exec(`insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, actor_user_id, requests, successful_requests, cost_nanos)
        values ${values.slice(i, i + 2000).join(',')}`);
    }
    return { keys, rows: values.length };
  };
  const timeIt = async (fn, runs = 7) => {
    const times = [];
    for (let i = 0; i < runs; i += 1) {
      const started = performance.now();
      await fn();
      times.push(performance.now() - started);
    }
    return [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
  };
  {
    const w = await workspace('Fifty');
    const { keys, rows: usageRows } = await bench(w, 8);
    const scopes = [
      { scope_type: 'workspace' },
      ...keys.map((key) => ({ scope_type: 'key', scope_id: key })),
      { scope_type: 'model', scope_id: 'openai/gpt-5' },
      { scope_type: 'provider', scope_id: 'anthropic' },
      { scope_type: 'member', scope_id: owner },
    ];
    for (let i = 0; i < 50; i += 1) {
      await spikeRule(w, { name: `Spike ${i}`, window_hours: [1, 3, 6, 12, 24][i % 5], ...scopes[i % scopes.length] });
    }
    const fifty = await timeIt(() => evaluate(w, NOW));
    const result = await evaluate(w, NOW);
    assert.equal(result.rules, 50);
    console.log(`50 spike rules (windows 1-24 h, 7 scopes) over ${usageRows} rollup rows in 8 days: evaluator ${fifty.toFixed(1)} ms per workspace (median of 7), ${(fifty / 50).toFixed(2)} ms per rule`);
    assert(fifty < 2000, `50 spike rules evaluate in under 2 s on PGlite (took ${fifty.toFixed(0)} ms)`);
  }

  // ---- Cost per workspace with and without spike rules: 100 workspaces with 3 calendar rules,
  // then one 3-hour spike rule, then three spike rules (3 h workspace, 24 h key, 1 h model).
  {
    const count = 100;
    const made = [];
    for (let i = 0; i < count; i += 1) {
      const w = await workspace(`Bench ${i}`, 'Europe/London');
      made.push(w);
      for (let day = 0; day < 30; day += 1) {
        for (const hour of [9, 10, 11, 14, 18]) {
          await addUsage(w, nanos(0.5 + (i % 7)), at('2026-09-22T00:00:00Z', day * 24 + hour));
        }
      }
      await rule(w, { name: 'Spend', metric: 'spend', period: 'month', threshold_amount_nanos: nanos(10_000) });
      await rule(w, { name: 'Budget', metric: 'budget_percent', period: 'month', base_kind: 'amount', base_amount_nanos: nanos(10_000), threshold_percents: [50, 80, 100] });
      await rule(w, { name: 'Daily', metric: 'spend', period: 'day', threshold_amount_nanos: nanos(10_000) });
    }
    const run = async () => {
      const times = [];
      for (const w of made) {
        const started = performance.now();
        await evaluate(w, NOW);
        times.push(performance.now() - started);
      }
      const sorted = [...times].sort((a, b) => a - b);
      return `median ${sorted[Math.floor(count / 2)].toFixed(2)} ms, p90 ${sorted[Math.floor(count * 0.9)].toFixed(2)} ms`;
    };
    const base = await run();
    for (const w of made) await spikeRule(w, { name: 'Spike 3h' });
    const withOne = await run();
    for (const w of made) {
      await spikeRule(w, { name: 'Key spike 24h', window_hours: 24, scope_type: 'key', scope_id: w.key });
      await spikeRule(w, { name: 'Model spike 1h', window_hours: 1, scope_type: 'model', scope_id: 'openai/gpt-5' });
    }
    const three = await run();
    console.log(`evaluator per workspace (${count} workspaces, 150 rollup rows each): 3 calendar rules ${base}; `
      + `+ one 3 h spike rule ${withOne}; + three spike rules (3 h, 24 h key, 1 h model) ${three}`);
  }

  console.log('spend-rules-spike: ok');
} finally {
  await db.close();
}
