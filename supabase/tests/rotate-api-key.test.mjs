// Standalone PostgreSQL regression test for public.rotate_api_key, which replaces an API key with a
// new secret and copies everything that points at the old key to the replacement in one transaction.
// Checks:
// * coverage: every table that references public.keys is either copied by the function or listed
//   below with the reason it is not, and every keys and workspace_spend_rules column is accounted for,
//   so a new key-linked table or column fails here until someone decides what rotation does with it;
// * the replacement gets the key settings, guardrails, destinations, dynamic route and key spend
//   rules (with their notification destinations), and the old key keeps its own links;
// * the old key's expiry is set only when asked; a failure part-way leaves nothing behind;
// * other workspaces' keys, deleted keys and workload identity keys are refused; service role only.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/rotate-api-key.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();

// ---- The migration, the declarative file and the manifest agree, and CI runs this suite.
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
let newest = migrations.find((name) => name.endsWith('_rotate_api_key.sql'));
assert(newest, 'the migration exists');
for (const name of migrations.filter((name) => name > newest)) {
  if ((await read(`../migrations/${name}`)).includes('FUNCTION public.rotate_api_key')) newest = name;
}
const migration = await read(`../migrations/${newest}`);
const schemaFile = 'public/functions/rotate_api_key.sql';
const functionSql = await read(`../schemas/${schemaFile}`);
assert(normalize(migration).includes(normalize(functionSql)), `${schemaFile} is in ${newest}`);
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const list of ['loadOrder', 'files']) assert(manifest[list].includes(schemaFile), `${schemaFile} is in the manifest's ${list}`);
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/rotate-api-key\.test\.mjs/, 'CI runs this suite');

// ---- Coverage: every table that references public.keys is copied or skipped for a stated reason.
const CARRIED = ['key_guardrails', 'broadcast_destination_keys', 'gateway_dynamic_route_keys', 'workspace_spend_rules'];
const SKIPPED = {
  api_key_requests: 'the request a key was issued from; history of the old key',
  gateway_batch_key_usage_records: 'usage history of the old key',
  gateway_realtime_billing_reviews: 'billing history of the old key',
  gateway_realtime_sessions: 'sessions opened with the old key',
  gateway_requests: 'request history of the old key',
  gateway_upstream_requests: 'request history of the old key',
  gateway_wallet_reservations: 'in-flight charges made with the old key',
  v2_request_facts: 'request history of the old key',
  key_storage_incident_keys: 'an incident record about the old key',
  oauth_refresh_tokens: 'OAuth tokens bound to the old key; an app must sign in again',
  slack_installations: 'Phaseo manages the Slack agent key, and managed keys cannot be rotated',
  workload_identity_policies: 'workload identity keys have no secret and cannot be rotated',
  workspace_rate_limit_policy_assignments: 'legacy; rate limits are rate guardrails in key_guardrails, and nothing reads this table',
};
const tablesDir = new URL('../schemas/public/tables/', import.meta.url);
const referencing = [];
for (const name of (await readdir(tablesDir)).filter((name) => name.endsWith('.sql'))) {
  if (/REFERENCES\s+"?public"?\."?keys"?\s*\(/i.test(await readFile(new URL(name, tablesDir), 'utf8'))) referencing.push(name.replace(/\.sql$/, ''));
}
assert.deepEqual(referencing.sort(), [...CARRIED, ...Object.keys(SKIPPED)].sort(),
  'every table referencing public.keys is in CARRIED or SKIPPED in rotate-api-key.test.mjs (add new ones with a decision)');
for (const table of CARRIED) assert.match(functionSql, new RegExp(`insert into public\\.${table}\\s*\\(`), `rotate_api_key copies ${table}`);

const columnsOf = (sql) => [...sql.slice(sql.indexOf('(')).matchAll(/^\s+"([a-z_]+)"\s+[a-z]/gm)].map((match) => match[1]);
const insertColumns = (table) => {
  const match = functionSql.match(new RegExp(`insert into public\\.${table} \\(([^)]*)\\)`));
  assert(match, `rotate_api_key inserts into ${table}`);
  return match[1].split(',').map((column) => column.trim()).filter(Boolean);
};
// Key columns the replacement does not copy, and why.
const KEY_COLUMNS_NOT_COPIED = {
  id: 'new key', created_at: 'new key', updated_at: 'new key', last_used_at: 'new key',
  expires_at: 'the replacement starts with no expiry, as before', revoked_at: 'new key', revoked_reason: 'new key',
  key_kind: 'a rotated key is a standard key', issued_via: 'the dashboard default',
  oauth_client_id: 'OAuth keys are replaced by signing in again', oauth_user_id: 'as oauth_client_id',
  oauth_scopes: 'as oauth_client_id', oauth_resource: 'as oauth_client_id',
};
const keyColumns = columnsOf(await readFile(new URL('keys.sql', tablesDir), 'utf8'));
assert(keyColumns.includes('never_store_content') && keyColumns.includes('department_id'), 'keys columns parsed');
assert.deepEqual(keyColumns.filter((column) => !(column in KEY_COLUMNS_NOT_COPIED)).sort(), insertColumns('keys').sort(),
  'every keys column is copied by rotate_api_key or listed in KEY_COLUMNS_NOT_COPIED');
const SPEND_RULE_COLUMNS_NOT_COPIED = ['id', 'scope_key_id', 'scope_user_id', 'scope_department_id', 'created_at', 'updated_at', 'deleted_at'];
const spendRuleColumns = columnsOf(await readFile(new URL('workspace_spend_rules.sql', tablesDir), 'utf8'));
assert.deepEqual(spendRuleColumns.filter((column) => !SPEND_RULE_COLUMNS_NOT_COPIED.includes(column)).sort(), insertColumns('workspace_spend_rules').sort(),
  'every workspace_spend_rules column is copied or listed in SPEND_RULE_COLUMNS_NOT_COPIED');

// ---- Behaviour, against minimal copies of the tables involved.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [W1, W2] = [id(1), id(2)];
const [U1, U2] = [id(3), id(4)];
const DEPT = id(5);
const [K1, KFOREIGN, KDELETED, KWORKLOAD, KPLAIN] = [id(11), id(12), id(13), id(14), id(15)];
const [GACCESS, GRATE] = [id(21), id(22)];
const [DEST_INCLUDE, DEST_EXCLUDE] = [id(31), id(32)];
const ROUTE = id(41);
const [RULE, RULE_DELETED, RULE_OTHER_KEY] = [id(51), id(52), id(53)];
const NOTIFY = id(61);

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
let secret = 0;
const rotate = (workspaceId, keyId, { name = 'rotated', expire = false, expiresAt = null } = {}) => {
  secret += 1;
  return db.query(
    'select public.rotate_api_key($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid, $8, $9::timestamptz) as result',
    [workspaceId, keyId, name, `kid_${secret}`, `hash_${secret}`, `pfx_${secret}`, U2, expire, expiresAt],
  ).then((result) => result.rows[0].result);
};
const keyCount = async () => Number((await rows('select count(*)::int n from public.keys'))[0].n);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.workspaces (id uuid primary key);
    create table public.users (user_id uuid primary key);
    create table public.workspace_departments (id uuid not null, workspace_id uuid not null, primary key (id), unique (id, workspace_id));
    create table public.keys (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null references public.workspaces(id),
      name text not null, hash text not null unique, prefix text not null,
      status text not null default 'active', scopes text not null,
      created_at timestamptz not null default now(), last_used_at timestamptz default now(),
      kid text, soft_blocked boolean not null default false,
      daily_limit_requests bigint not null default 0, weekly_limit_requests bigint not null default 0, monthly_limit_requests bigint not null default 0,
      daily_limit_cost_nanos bigint not null default 0, weekly_limit_cost_nanos bigint not null default 0, monthly_limit_cost_nanos bigint not null default 0,
      expires_at timestamptz, revoked_at timestamptz, revoked_reason text,
      key_kind text not null default 'standard', oauth_client_id text, oauth_user_id uuid, oauth_scopes text[],
      issued_via text not null default 'dashboard', oauth_resource text, updated_at timestamptz not null default now(),
      ip_allowlist jsonb not null default '[]', created_by uuid not null references public.users(user_id),
      department_id uuid, never_store_content boolean not null default false, storage_locations text[] not null default '{}',
      unique (id, workspace_id)
    );
    create table public.workspace_guardrails (id uuid primary key, workspace_id uuid not null, kind text not null default 'access');
    create table public.key_guardrails (
      key_id uuid not null references public.keys(id) on delete cascade,
      guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade,
      created_at timestamptz not null default now(), primary key (key_id, guardrail_id)
    );
    create table public.workspace_broadcast_destinations (id uuid primary key, workspace_id uuid not null);
    create table public.broadcast_destination_keys (
      destination_id uuid not null references public.workspace_broadcast_destinations(id) on delete cascade,
      key_id uuid not null references public.keys(id) on delete cascade,
      created_at timestamptz not null default now(), filter_mode text not null default 'include',
      primary key (destination_id, key_id)
    );
    create table public.gateway_dynamic_routes (id uuid primary key);
    create table public.gateway_dynamic_route_keys (
      route_id uuid not null references public.gateway_dynamic_routes(id) on delete cascade,
      key_id uuid not null references public.keys(id) on delete cascade unique,
      attached_by uuid, attached_at timestamptz not null default now(), primary key (route_id, key_id)
    );
    create table public.workspace_spend_rules (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null, name text not null,
      enabled boolean not null default true, metric text not null, scope_type text not null default 'workspace', scope_id text,
      scope_key_id uuid generated always as (case when scope_type = 'key' then scope_id::uuid else null end) stored,
      scope_user_id uuid generated always as (case when scope_type = 'member' then scope_id::uuid else null end) stored,
      scope_department_id uuid generated always as (case when scope_type = 'department' then scope_id::uuid else null end) stored,
      period text not null, window_hours integer, time_zone text, base_kind text, base_ref text, base_amount_nanos bigint,
      threshold_percents integer[], threshold_amount_nanos bigint, runway_days integer, spike_multiplier numeric(6,2),
      spike_floor_nanos bigint, action text not null default 'notify', block_at_percent integer not null default 110,
      block_at_amount_nanos bigint, block_free_models boolean not null default false, cooldown_minutes integer not null default 360,
      created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
      unique (id, workspace_id),
      foreign key (scope_key_id, workspace_id) references public.keys(id, workspace_id) on delete cascade
    );
    create table public.workspace_spend_rule_destinations (
      rule_id uuid not null, destination_id uuid not null, workspace_id uuid not null,
      created_at timestamptz not null default now(), primary key (rule_id, destination_id),
      foreign key (rule_id, workspace_id) references public.workspace_spend_rules(id, workspace_id) on delete cascade
    );
  `);
  await db.exec(migration);
  await db.exec(`
    insert into public.workspaces values ('${W1}'), ('${W2}');
    insert into public.users values ('${U1}'), ('${U2}');
    insert into public.workspace_departments values ('${DEPT}', '${W1}');
    insert into public.keys (id, workspace_id, name, hash, prefix, scopes, created_by, kid, soft_blocked, daily_limit_requests,
        monthly_limit_cost_nanos, ip_allowlist, department_id, never_store_content, storage_locations, expires_at)
      values ('${K1}', '${W1}', 'prod', 'h1', 'p1', '[]', '${U1}', 'k1', true, 100, 5000000000,
        '[{"address":"10.0.0.0/8","label":"office"}]', '${DEPT}', true, '{eu}', '2030-01-01T00:00:00Z');
    insert into public.keys (id, workspace_id, name, hash, prefix, scopes, created_by) values
      ('${KFOREIGN}', '${W2}', 'other', 'h2', 'p2', '[]', '${U1}'),
      ('${KPLAIN}', '${W1}', 'plain', 'h5', 'p5', '[]', '${U1}');
    insert into public.keys (id, workspace_id, name, hash, prefix, scopes, created_by, status) values ('${KDELETED}', '${W1}', 'gone', 'h3', 'p3', '[]', '${U1}', 'deleted');
    insert into public.keys (id, workspace_id, name, hash, prefix, scopes, created_by, key_kind) values ('${KWORKLOAD}', '${W1}', 'ci', 'h4', 'p4', '[]', '${U1}', 'workload_identity');
    insert into public.workspace_guardrails values ('${GACCESS}', '${W1}', 'access'), ('${GRATE}', '${W1}', 'rate');
    insert into public.key_guardrails (key_id, guardrail_id) values ('${K1}', '${GACCESS}'), ('${K1}', '${GRATE}');
    insert into public.workspace_broadcast_destinations values ('${DEST_INCLUDE}', '${W1}'), ('${DEST_EXCLUDE}', '${W1}');
    insert into public.broadcast_destination_keys (destination_id, key_id, filter_mode) values ('${DEST_INCLUDE}', '${K1}', 'include'), ('${DEST_EXCLUDE}', '${K1}', 'exclude');
    insert into public.gateway_dynamic_routes values ('${ROUTE}');
    insert into public.gateway_dynamic_route_keys (route_id, key_id, attached_by) values ('${ROUTE}', '${K1}', '${U1}');
    insert into public.workspace_spend_rules (id, workspace_id, name, metric, scope_type, scope_id, period, base_kind, base_ref, threshold_percents, action, block_at_percent, created_by)
      values ('${RULE}', '${W1}', 'prod key budget', 'spend', 'key', '${K1}', 'month', 'key_limit', 'monthly', '{50,90}', 'block', 120, '${U1}'),
             ('${RULE_DELETED}', '${W1}', 'old rule', 'spend', 'key', '${K1}', 'month', null, null, '{80}', 'notify', 110, '${U1}'),
             ('${RULE_OTHER_KEY}', '${W1}', 'plain key', 'spend', 'key', '${KPLAIN}', 'month', null, null, '{80}', 'notify', 110, '${U1}');
    update public.workspace_spend_rules set deleted_at = now() where id = '${RULE_DELETED}';
    insert into public.workspace_spend_rule_destinations values ('${RULE}', '${NOTIFY}', '${W1}', now());
  `);

  // ---- Everything is carried over, and the old key keeps its links.
  const result = await rotate(W1, K1, { name: '  prod (rotated)  ' });
  const NEW = result.replacement_key_id;
  assert.deepEqual(result.carried, { guardrails: 2, rate_guardrails: 1, destinations: 2, dynamic_routes: 1, spend_rules: 1, department: true });
  const [replacement] = await rows('select * from public.keys where id = $1', [NEW]);
  assert.equal(replacement.name, 'prod (rotated)');
  assert.equal(replacement.hash, `hash_${secret}`);
  assert.equal(replacement.status, 'active');
  assert.equal(replacement.created_by, U2);
  assert.equal(replacement.soft_blocked, true);
  assert.equal(replacement.never_store_content, true, 'a never-store key stays never-store');
  assert.deepEqual(replacement.storage_locations, ['eu']);
  assert.deepEqual(replacement.ip_allowlist, [{ address: '10.0.0.0/8', label: 'office' }]);
  assert.equal(replacement.department_id, DEPT);
  assert.equal(Number(replacement.daily_limit_requests), 100);
  assert.equal(Number(replacement.monthly_limit_cost_nanos), 5000000000);
  assert.equal(replacement.expires_at, null);
  const links = async (keyId) => ({
    guardrails: (await rows('select guardrail_id from public.key_guardrails where key_id = $1 order by 1', [keyId])).map((row) => row.guardrail_id),
    destinations: (await rows('select destination_id, filter_mode from public.broadcast_destination_keys where key_id = $1 order by 1', [keyId])).map((row) => `${row.destination_id}:${row.filter_mode}`),
    routes: (await rows('select route_id from public.gateway_dynamic_route_keys where key_id = $1', [keyId])).map((row) => row.route_id),
  });
  const expectedLinks = { guardrails: [GACCESS, GRATE], destinations: [`${DEST_INCLUDE}:include`, `${DEST_EXCLUDE}:exclude`], routes: [ROUTE] };
  assert.deepEqual(await links(NEW), expectedLinks, 'the replacement has every link');
  assert.deepEqual(await links(K1), expectedLinks, 'the old key keeps its links during its grace period');
  const copiedRules = await rows('select * from public.workspace_spend_rules where scope_key_id = $1', [NEW]);
  assert.equal(copiedRules.length, 1, 'live key spend rules are copied, deleted ones are not');
  const [copied] = copiedRules;
  assert.notEqual(copied.id, RULE);
  assert.equal(copied.name, 'prod key budget');
  assert.equal(copied.action, 'block');
  assert.equal(copied.block_at_percent, 120);
  assert.equal(copied.base_kind, 'key_limit');
  assert.deepEqual(copied.threshold_percents, [50, 90]);
  assert.deepEqual((await rows('select destination_id from public.workspace_spend_rule_destinations where rule_id = $1', [copied.id])).map((row) => row.destination_id), [NOTIFY]);
  assert.equal((await rows('select count(*)::int n from public.workspace_spend_rules where scope_key_id = $1 and deleted_at is null', [K1]))[0].n, 1, "the old key's rule stays");
  const [oldKey] = await rows('select expires_at from public.keys where id = $1', [K1]);
  assert.equal(oldKey.expires_at.toISOString(), '2030-01-01T00:00:00.000Z', 'expiry untouched when not asked');
  assert.equal(new Date(result.previous_expires_at).toISOString(), '2030-01-01T00:00:00.000Z', 'returns the old expiry so a caller can restore it');

  // ---- A key with no links: nothing to carry; the old key's expiry is set when asked, NULL meaning never.
  const plain = await rotate(W1, KPLAIN, { expire: true, expiresAt: '2031-06-01T00:00:00Z' });
  assert.deepEqual(plain.carried, { guardrails: 0, rate_guardrails: 0, destinations: 0, dynamic_routes: 0, spend_rules: 1, department: false });
  assert.equal((await rows('select expires_at from public.keys where id = $1', [KPLAIN]))[0].expires_at.toISOString(), '2031-06-01T00:00:00.000Z');
  await rotate(W1, KPLAIN, { expire: true, expiresAt: null });
  assert.equal((await rows('select expires_at from public.keys where id = $1', [KPLAIN]))[0].expires_at, null);

  // ---- A failure part-way leaves no replacement and no copied links.
  await db.exec(`
    create function public.fail_spend_copy() returns trigger language plpgsql as $$
    begin raise exception 'simulated failure'; end $$;
    create trigger fail_spend_copy before insert on public.workspace_spend_rules for each row execute function public.fail_spend_copy();
  `);
  const before = { keys: await keyCount(), guardrails: (await rows('select count(*)::int n from public.key_guardrails'))[0].n };
  await assert.rejects(rotate(W1, K1, { expire: true, expiresAt: '2020-01-01T00:00:00Z' }), /simulated failure/);
  assert.equal(await keyCount(), before.keys, 'no replacement key is left behind');
  assert.equal((await rows('select count(*)::int n from public.key_guardrails'))[0].n, before.guardrails, 'no guardrail is copied');
  assert.equal((await rows('select expires_at from public.keys where id = $1', [K1]))[0].expires_at.toISOString(), '2030-01-01T00:00:00.000Z', 'the old key is not expired');
  await db.exec('drop trigger fail_spend_copy on public.workspace_spend_rules');

  // ---- Refusals write nothing.
  const count = await keyCount();
  await assert.rejects(rotate(W1, KFOREIGN), /api_key_not_found/);
  await assert.rejects(rotate(W1, KDELETED), /api_key_not_found/);
  await assert.rejects(rotate(W1, KWORKLOAD), /key_not_rotatable/);
  await assert.rejects(rotate(W1, K1, { name: '   ' }), /api_key_name_required/);
  assert.equal(await keyCount(), count, 'refused rotations create no key');

  // ---- Service role only.
  const grants = await rows(`select has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') authenticated,
      has_function_privilege('service_role', p.oid, 'execute') service
    from pg_proc p where p.proname = 'rotate_api_key'`);
  assert.deepEqual(grants, [{ anon: false, authenticated: false, service: true }]);
  console.log('rotate_api_key: ok');
} finally {
  await db.close();
}
