// Standalone PostgreSQL regression test for spend rule blocks (grace margin): a block starts once
// spend reaches the block point (block_at_amount_nanos, or block_at_percent of the base) and not
// before, only with p_blocks and a current evaluation; it lifts at the period reset, below the
// limit, and when its rule is deleted, disabled or changed; a manual lift holds for the period;
// every start and lift queues one spend_blocked event, which becomes a money push; the gateway's
// KV entry lists blocks, grace-margin warnings and department membership. Runs the spend rules
// schema, evaluator, API and blocks migrations whole on a minimal pre-migration schema.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/spend-rule-blocks.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
const find = (suffix) => migrations.find((name) => name.endsWith(suffix));
const [schemaMigrationName, evaluatorMigrationName, apiMigrationName, migrationName] =
  ['_spend_rules_schema.sql', '_spend_rules_evaluator.sql', '_spend_rules_api.sql', '_spend_rule_blocks.sql'].map(find);
assert(schemaMigrationName && evaluatorMigrationName && apiMigrationName && migrationName, 'the spend rules migrations exist');
assert(migrationName > apiMigrationName, 'the blocks migration runs after the API migration');
const migration = await read(`../migrations/${migrationName}`);
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();

// ---- The migration carries the schema files, the manifest lists the new ones, CI runs this suite.
const added = [
  'private/functions/spend_scope_label.sql',
  'private/functions/queue_spend_block_event.sql',
  'public/functions/list_workspace_spend_blocks.sql',
  'public/functions/lift_workspace_spend_block.sql',
  'public/functions/get_workspace_spend_block_entry.sql',
  'public/functions/list_spend_block_workspaces.sql',
  'public/functions/lift_spend_blocks_on_rule_change.sql',
];
const redefined = [
  'private/functions/evaluate_workspace_spend_rules.sql',
  'public/functions/sweep_spend_rules.sql',
  'private/functions/capture_workspace_notification_events.sql',
];
const laterMigrations = migrations.filter((name) => name > migrationName);
for (const file of [...added, ...redefined]) {
  const signature = `FUNCTION ${file.split('/')[0]}.${file.split('/').pop().replace(/\.sql$/, '')}`;
  let newest = migration;
  for (const name of laterMigrations) {
    const sql = await read(`../migrations/${name}`);
    if (sql.includes(signature)) newest = sql;
  }
  assert(normalize(newest).includes(normalize(await read(`../schemas/${file}`))), `${file} is in the newest migration that defines it`);
}
const table = await read('../schemas/public/tables/workspace_spend_rules.sql');
for (const trigger of table.replace(/\r\n/g, '\n').match(/CREATE TRIGGER workspace_spend_rules_lift_blocks[^;]*;/g) ?? []) {
  assert(normalize(migration).includes(trigger), 'the lift triggers are declared and migrated');
}
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of added) for (const list of ['loadOrder', 'files']) assert(manifest[list].includes(file), `${file} is in the manifest's ${list}`);
assert.match(migration, /^-- phaseo:allow-destructive-migration reason: /, 'the function replacements are marked as reviewed');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/spend-rule-blocks\.test\.mjs/, 'CI runs this suite');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const W1 = id(1); // UTC billing zone
const W2 = id(2);
const W3 = id(3); // deleted with an active block
const owner = id(11);
const alice = id(12);
const bob = id(13);
const K1 = id(21); // alice's 'prod', no department
const K2 = id(22); // bob's 'batch', explicitly in Ops
const K3 = id(23); // alice's 'ops-tools', explicitly in Ops
const D1 = id(31); // Research: alice
const D2 = id(32); // Ops

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const count = async (sql, params) => (await one(`select count(*)::int n from ${sql}`, params)).n;
const nanos = (dollars) => Math.round(dollars * 1e9);

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
    -- The real table's workspace foreign key: a lift event must never be queued for a workspace
    -- that is being deleted, or the deletion would fail.
    create table public.email_outbox (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), kind text not null,
      template text not null default 'generic', to_email text not null, subject text,
      workspace_id uuid references public.workspaces(id) on delete set null, user_id uuid, payload jsonb not null default '{}',
      dedupe_key text unique);
    create table public.workspace_audit_events (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), workspace_id uuid,
      actor_user_id uuid, action text, target_type text, target_id text, target_name text, metadata jsonb);
    create table public.workspace_settings (workspace_id uuid primary key references public.workspaces(id) on delete cascade, department_spend_attribution text not null default 'all');
    create table public.gateway_requests (id uuid primary key default gen_random_uuid(), created_at timestamptz not null, workspace_id uuid not null,
      key_id uuid, oauth_user_id uuid, endpoint text not null, success boolean, cost_nanos bigint, model_id text, provider text);
    create table public.v2_models (model_slug text primary key, name text not null);
    create table public.v2_model_provider_routes (provider_model_id text primary key, model_slug text not null, provider_slug text not null);
    insert into public.oauth_clients values ('phaseo_cli', array['keys:read'], null);
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
  for (const name of [schemaMigrationName, evaluatorMigrationName, apiMigrationName, migrationName]) {
    await db.exec(await read(`../migrations/${name}`));
  }

  // ---- Grants: service role only.
  const functions = ['get_workspace_spend_block_entry', 'list_workspace_spend_blocks', 'lift_workspace_spend_block', 'list_spend_block_workspaces',
    'queue_spend_block_event', 'spend_scope_label', 'evaluate_workspace_spend_rules', 'sweep_spend_rules', 'lift_spend_blocks_on_rule_change'];
  const grants = await rows(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') authenticated, has_function_privilege('service_role', p.oid, 'execute') service
    from pg_proc p where p.proname = any($1)`, [functions]);
  assert.equal(grants.length, functions.length, 'one definition of each (the old sweep and evaluator signatures are gone)');
  for (const grant of grants) {
    assert.equal(grant.anon, false, `${grant.proname}: anon`);
    assert.equal(grant.authenticated, false, `${grant.proname}: authenticated`);
    assert.equal(grant.service, true, `${grant.proname}: service_role`);
  }

  // ---- Fixture. Times are relative to the database clock: blocks only start on a current
  // evaluation. The UTC day starts at TODAY; usage sits in its first 15-minute bucket.
  const { today, yesterday, tomorrow } = await one(`select date_trunc('day', now()) today, date_trunc('day', now()) - interval '1 day' yesterday,
    date_trunc('day', now()) + interval '1 day' tomorrow`);
  await db.exec(`
    insert into auth.users values ('${owner}', 'owner@example.com'), ('${alice}', 'alice@example.com'), ('${bob}', 'bob@example.com');
    insert into public.workspaces values ('${W1}', 'Acme', '${owner}'), ('${W2}', 'Other', '${owner}'), ('${W3}', 'Doomed', '${owner}');
    insert into public.workspace_members values ('${W1}', '${owner}', 'owner'), ('${W1}', '${alice}', 'member'), ('${W1}', '${bob}', 'member'),
      ('${W2}', '${owner}', 'owner'), ('${W3}', '${owner}', 'owner');
    insert into public.workspace_settings (workspace_id) values ('${W1}'), ('${W2}'), ('${W3}');
    insert into public.workspace_departments values ('${D1}', '${W1}', 'Research'), ('${D2}', '${W1}', 'Ops');
    insert into public.workspace_department_grants (workspace_id, user_id, department_id) values ('${W1}', '${alice}', '${D1}'), ('${W1}', '${bob}', '${D2}');
    insert into public.keys (id, workspace_id, name, created_by, department_id) values
      ('${K1}', '${W1}', 'prod', '${alice}', null), ('${K2}', '${W1}', 'batch', '${bob}', '${D2}'), ('${K3}', '${W1}', 'ops-tools', '${alice}', '${D2}');
    insert into public.workspace_budgets (workspace_id, interval, limit_nanos) values ('${W1}', 'daily', 20000000000);
    insert into public.v2_models values ('openai/gpt-5', 'GPT-5');
    insert into public.v2_model_provider_routes values ('route-gpt', 'openai/gpt-5', 'openai');
  `);
  let spent = 0;
  const addUsage = async (dollars, workspace = W1, key = K1, actor = alice) => {
    if (workspace === W1) spent += dollars;
    await db.query(`insert into public.v2_private_usage_15m (workspace_id, bucket_start, model_id, provider_model_id, key_id, actor_user_id, requests, successful_requests, cost_nanos)
      values ($1, $2, 'openai/gpt-5', 'route-gpt', $3, $4, 1, 1, $5)
      on conflict (workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok, actor_user_id)
      do update set cost_nanos = public.v2_private_usage_15m.cost_nanos + excluded.cost_nanos`, [workspace, today, key, actor, nanos(dollars)]);
  };
  const rule = async (name, values, workspace = W1) => (await one(
    `insert into public.workspace_spend_rules (workspace_id, name, ${Object.keys(values).join(', ')}) values ($1, $2, ${Object.keys(values).map((_, i) => `$${i + 3}`).join(', ')}) returning id`,
    [workspace, name, ...Object.values(values)])).id;
  const spendBlock = (threshold, blockAt, extra = {}) => ({ metric: 'spend', period: 'day', threshold_amount_nanos: nanos(threshold), action: 'block', block_at_amount_nanos: nanos(blockAt), ...extra });
  const evaluate = async (workspace = W1, blocks = true, now = null) => (await one(
    'select private.evaluate_workspace_spend_rules($1, coalesce($2::timestamptz, now()), $3) r', [workspace, now, blocks])).r;
  const sweep = async (blocks = true) => (await one('select public.sweep_spend_rules(now(), 100, $1) r', [blocks])).r;
  const active = async (ruleId) => one('select * from public.workspace_spend_blocks where rule_id = $1 and lifted_at is null', [ruleId]);
  const entry = async (workspace = W1) => (await one('select public.get_workspace_spend_block_entry($1) e', [workspace])).e;
  const events = async (ruleId) => rows(`select payload, dedupe_key from public.email_outbox where kind = 'spend_blocked' and payload ->> 'rule_id' = $1 order by created_at, dedupe_key`, [ruleId]);
  const lift = async (blockId, workspace = W1, actor = owner) => (await one('select public.lift_workspace_spend_block($1, $2, $3) b', [workspace, blockId, actor])).b;

  // ---- Grace margin on a $ rule: warn at $10, block at $15.
  const R1 = await rule('Daily cap', spendBlock(10, 15));
  await addUsage(12);
  let result = await evaluate();
  assert.equal(result.fired, 1, 'the $10 warning fires');
  assert.deepEqual(result.blocks, [], 'past the warning but before the block point: no block');
  assert.equal(result.block_scope, true, 'a workspace with block rules is republished');
  let published = await entry();
  assert.deepEqual(published.blocks, []);
  assert.deepEqual(published.warnings.map((w) => [w.rule_id, w.scope_type, w.scope_id, w.block_free_models]), [[R1, 'workspace', null, false]],
    'in the grace margin: a warning for the gateway header');
  assert.equal(Date.parse(published.warnings[0].resets_at), Date.parse(tomorrow), 'the warning resets with the day');
  assert.equal(Date.parse(published.expires_at), Date.parse(tomorrow), 'the entry expires no later than the earliest reset');

  await addUsage(4); // $16
  assert.deepEqual((await evaluate(W1, false)).blocks, [], 'p_blocks false (SPEND_RULE_BLOCKS_ENABLED off): no block');
  assert.deepEqual((await evaluate(W1, true, new Date(Date.now() - 60 * 60_000).toISOString())).blocks, [], 'a stale evaluation never starts a block');
  assert.equal(await count('public.workspace_spend_blocks'), 0);
  result = await evaluate();
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].state, 'started');
  assert.equal(result.blocks[0].rule_id, R1);
  let block = await active(R1);
  assert.equal(block.scope_type, 'workspace');
  assert.equal(Number(block.spend_nanos), nanos(16));
  assert.equal(Number(block.limit_nanos), nanos(15));
  assert.equal(Date.parse(block.resets_at), Date.parse(tomorrow));
  assert.equal(Date.parse(block.period_start), Date.parse(today));
  assert.deepEqual((await evaluate()).blocks, [], 'an active block is not started twice');
  published = await entry();
  assert.deepEqual(published.blocks.map((b) => [b.id, b.rule_id, b.rule_name, b.scope_type, Number(b.limit_nanos)]), [[block.id, R1, 'Daily cap', 'workspace', nanos(15)]]);
  assert.deepEqual(published.warnings, [], 'a blocked rule is not also a warning');
  let [started] = await events(R1);
  assert.equal(started.dedupe_key, `spend_blocked:${block.id}:started`);
  assert.equal(started.payload.state, 'started');
  assert.equal(started.payload.title, 'Requests blocked: Daily cap');
  assert.match(started.payload.message, /^The workspace has spent \$16\.00 today, past the \$15\.00 block limit of "Daily cap"\. New requests in this workspace to paid models get a 429 until \w{3} \d+, 00:00 UTC/);
  assert.equal(started.payload.push.href, '/settings/notifications');

  // ---- Manual lift: holds for the rest of the period.
  const lifted = await lift(block.id);
  assert.equal(lifted.lift_reason, 'manual');
  assert.equal(lifted.lifted_by, owner);
  assert.equal(lifted.active, false);
  await assert.rejects(lift(block.id), /spend_block_not_active/);
  await assert.rejects(lift(block.id, W2), /spend_block_not_found/, 'another workspace cannot lift it');
  assert.deepEqual((await evaluate()).blocks, [], 'a block lifted by hand does not come back this period');
  published = await entry();
  assert.deepEqual(published.blocks, []);
  assert.deepEqual(published.warnings.map((w) => w.rule_id), [R1], 'lifted by hand but still past the warning: warned');
  const liftEvents = await events(R1);
  assert.equal(liftEvents.length, 2);
  assert.equal(liftEvents[1].payload.state, 'lifted');
  assert.equal(liftEvents[1].payload.lift_reason, 'manual');
  assert.match(liftEvents[1].payload.message, /owner@example\.com lifted the block/);

  // ---- Period reset: yesterday's block lifts; yesterday's manual lift does not stop today's block.
  const R2 = await rule('Yesterday', spendBlock(1, 2));
  const stale = (await one(`insert into public.workspace_spend_blocks (workspace_id, rule_id, scope_type, period_start, resets_at, spend_nanos, limit_nanos, started_at)
    values ($1, $2, 'workspace', $3, $4, 5000000000, 2000000000, $3) returning id`, [W1, R2, yesterday, today])).id;
  await db.query(`insert into public.workspace_spend_blocks (workspace_id, rule_id, scope_type, period_start, resets_at, spend_nanos, limit_nanos, started_at, lifted_at, lift_reason)
    values ($1, $2, 'workspace', $3, $4, 5000000000, 2000000000, $3, $3, 'manual')`, [W1, R2, yesterday, today]);
  published = await entry();
  assert(!published.blocks.some((b) => b.id === stale), 'a block past its reset is never published, even before the sweep lifts it');
  result = await sweep();
  const r2Changes = result.blocks.filter((change) => change.rule_id === R2).map((change) => [change.state, change.reason]);
  assert.deepEqual(r2Changes, [['lifted', 'period_reset'], ['started', null]], 'reset lifts the old block, then today\'s starts');
  assert.ok(result.publish.includes(W1), 'the sweep lists the workspace for republishing');
  assert.ok(result.blocks.every((change) => change.workspace_id === W1 && change.event_id));
  assert.equal((await one('select lift_reason from public.workspace_spend_blocks where id = $1', [stale])).lift_reason, 'period_reset');

  // ---- Grace point on a % rule: warn at 50 and 100% of $20, block at 110% ($22).
  const R3 = await rule('Budget grace', { metric: 'budget_percent', period: 'day', base_kind: 'workspace_budget', base_ref: 'daily',
    threshold_percents: '{50,100}', action: 'block', block_at_percent: 110 });
  await addUsage(5); // $21: 105%
  await evaluate();
  assert.equal(await active(R3), undefined, '105% is past the last warning but inside the grace margin');
  assert.ok((await entry()).warnings.some((w) => w.rule_id === R3), 'and warned');
  await addUsage(1); // $22: 110%
  await evaluate();
  block = await active(R3);
  assert.equal(Number(block.limit_nanos), nanos(22), 'the block point is block_at_percent of the base');
  // Raising the budget (not the rule) lifts it below the limit.
  await db.query(`update public.workspace_budgets set limit_nanos = 40000000000 where workspace_id = $1`, [W1]);
  result = await evaluate();
  assert.deepEqual(result.blocks.map((change) => [change.rule_id, change.state, change.reason]), [[R3, 'lifted', 'below_limit']]);
  await db.query(`update public.workspace_budgets set limit_nanos = 20000000000 where workspace_id = $1`, [W1]);
  await evaluate();
  assert.ok(await active(R3), 'back over the lowered budget: blocked again (only a manual lift holds)');

  // ---- Rule changes lift at once, in the same transaction (the trigger), with the reason.
  const R4 = await rule('Changes', spendBlock(1, 2));
  await evaluate();
  let r4 = await active(R4);
  assert.ok(r4);
  await db.query(`update public.workspace_spend_rules set block_at_amount_nanos = 3000000000 where id = $1`, [R4]);
  assert.ok(await active(R4), 'a new block point still below spend keeps the block');
  await db.query(`update public.workspace_spend_rules set block_free_models = true where id = $1`, [R4]);
  assert.equal((await active(R4)).block_free_models, true, 'the free-model setting follows the rule');
  await db.query(`update public.workspace_spend_rules set block_at_amount_nanos = 900000000000, threshold_amount_nanos = 1000000000 where id = $1`, [R4]);
  assert.equal(await active(R4), undefined, 'raised above spend: lifted');
  assert.equal((await one('select lift_reason from public.workspace_spend_blocks where id = $1', [r4.id])).lift_reason, 'rule_changed');
  await db.query(`update public.workspace_spend_rules set block_at_amount_nanos = 2000000000 where id = $1`, [R4]);
  await evaluate();
  r4 = await active(R4);
  assert.ok(r4, 'lowered again: the next evaluation blocks again');
  await db.query(`update public.workspace_spend_rules set scope_type = 'key', scope_id = $2 where id = $1`, [R4, K1]);
  assert.equal((await one('select lift_reason from public.workspace_spend_blocks where id = $1', [r4.id])).lift_reason, 'rule_changed', 'a new scope lifts the old block');
  await evaluate();
  r4 = await active(R4);
  assert.equal(r4.scope_type, 'key');
  assert.equal(r4.scope_id, K1);
  await db.query(`update public.workspace_spend_rules set enabled = false where id = $1`, [R4]);
  assert.equal((await one('select lift_reason from public.workspace_spend_blocks where id = $1', [r4.id])).lift_reason, 'rule_disabled');
  await db.query(`update public.workspace_spend_rules set enabled = true where id = $1`, [R4]);
  await evaluate();
  r4 = await active(R4);
  await db.query(`update public.workspace_spend_rules set deleted_at = now() where id = $1`, [R4]);
  assert.equal((await one('select lift_reason from public.workspace_spend_blocks where id = $1', [r4.id])).lift_reason, 'rule_deleted');
  const r4Events = (await events(R4)).map((event) => [event.payload.state, event.payload.lift_reason ?? null]);
  assert.deepEqual(r4Events.filter(([state]) => state === 'lifted').map(([, reason]) => reason), ['rule_changed', 'rule_changed', 'rule_disabled', 'rule_deleted']);

  // A hard delete (a cascade from the rule's key) lifts the block before the rule id is cleared.
  const K9 = id(29);
  await db.query(`insert into public.keys (id, workspace_id, name, created_by) values ($1, $2, 'temp', $3)`, [K9, W1, alice]);
  const R5 = await rule('Temp key', spendBlock(1, 2, { scope_type: 'key', scope_id: K9 }));
  await addUsage(3, W1, K9, alice);
  await evaluate();
  const r5 = await active(R5);
  assert.ok(r5);
  await db.query('delete from public.keys where id = $1', [K9]);
  const gone = await one('select rule_id, lift_reason from public.workspace_spend_blocks where id = $1', [r5.id]);
  assert.deepEqual([gone.rule_id, gone.lift_reason], [null, 'rule_deleted'], 'history survives with rule_id null, lifted');

  // ---- Department scope: the entry says who counts, without Postgres on the request path.
  const R6 = await rule('Research', spendBlock(1, 2, { scope_type: 'department', scope_id: D1 }));
  await evaluate();
  assert.ok(await active(R6), 'alice spends through K1 (no department of its own): Research');
  published = await entry();
  assert.deepEqual(published.departments[D1], { keys: [], users: [alice], exclude_keys: [K3] },
    'alice counts toward Research, except through K3, which belongs to Ops');
  const R7 = await rule('Ops', spendBlock(1000, 2000, { scope_type: 'department', scope_id: D2 }));
  await db.query(`insert into public.workspace_spend_rule_state (rule_id, workspace_id, period_start, period_end, amount_fired_at, fire_count)
    values ($1, $2, $3, $4, now(), 1)`, [R7, W1, today, tomorrow]);
  published = await entry();
  assert.deepEqual(published.warnings.filter((w) => w.rule_id === R7).map((w) => w.scope_id), [D2]);
  assert.deepEqual(published.departments[D2], { keys: [K2, K3], users: [bob], exclude_keys: [] }, 'Ops: its two keys, and bob');

  // ---- Lists.
  const listed = (await one('select public.list_workspace_spend_blocks($1) l', [W1])).l;
  assert.ok(listed.length >= 3 && listed.every((item) => item.active && item.lifted_at === null));
  const research = listed.find((item) => item.rule_id === R6);
  assert.equal(research.scope_label, 'Research');
  assert.equal(research.rule_name, 'Research');
  const all = (await one('select public.list_workspace_spend_blocks($1, true, 100) l', [W1])).l;
  assert.ok(all.length > listed.length, 'lifted blocks on request');
  assert.ok(all.every((item, index) => index === 0 || Date.parse(all[index - 1].started_at) >= Date.parse(item.started_at)), 'newest first');
  assert.deepEqual((await one('select public.list_workspace_spend_blocks($1) l', [W2])).l, []);
  const reconcile = (await rows('select public.list_spend_block_workspaces() w')).map((row) => row.w);
  assert.deepEqual(reconcile, [W1]);
  assert.equal(await entry(W2), null, 'nothing active: no entry (the publisher deletes the key)');

  // ---- Money push: spend_blocked rows become push events; a key block reaches the key's creator.
  await db.exec(`insert into public.workspace_notification_cursors (source, read_until) values ('email_outbox', now() - interval '1 hour'), ('workspace_audit_events', now())`);
  await db.exec('select private.capture_workspace_notification_events(500)');
  const pushes = await rows(`select category, key_id, key_created_by, payload from public.workspace_notification_events where kind = 'spend_blocked'`);
  assert.ok(pushes.length >= 10 && pushes.every((push) => push.category === 'money'));
  assert.ok(pushes.some((push) => push.key_id === K1 && push.key_created_by === alice && push.payload.scope.type === 'key'));

  // ---- Deleting a workspace with an active block works (no event for a vanishing workspace).
  const R8 = await rule('Doomed', spendBlock(1, 2), W3);
  await addUsage(5, W3, null, owner);
  await evaluate(W3);
  assert.ok(await active(R8));
  await db.query('delete from public.workspaces where id = $1', [W3]);
  assert.equal(await count('public.workspace_spend_blocks where workspace_id = $1', [W3]), 0);

  // ---- Cost: the evaluator on 50 block rules, and the entry.
  for (let n = 0; n < 40; n += 1) await rule(`Filler ${n}`, spendBlock(1000 + n, 2000 + n));
  let started_at = performance.now();
  await evaluate();
  const evaluateMs = performance.now() - started_at;
  started_at = performance.now();
  await entry();
  const entryMs = performance.now() - started_at;
  console.log(JSON.stringify({ evaluate_50_rules_ms: Math.round(evaluateMs * 100) / 100, entry_ms: Math.round(entryMs * 100) / 100,
    entry_bytes: JSON.stringify(await entry()).length }));

  console.log('spend rule blocks: ok');
} finally {
  await db.close();
}
