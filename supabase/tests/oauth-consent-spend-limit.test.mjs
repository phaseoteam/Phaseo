// Standalone PostgreSQL regression test: the monthly spending limit a person approves for an OAuth app on
// the consent screen is stored with that consent's authorization code, and the code exchange makes it the
// app's delegated key's monthly cost limit, on a new key or a renewed one. The request-context check the
// gateway already runs for every key refuses the key's requests once the month's spend reaches it, and
// approving the app again never restarts the month: the renewed key keeps its id, so its spend stays counted.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/oauth-consent-spend-limit.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { installCatalogPolicyContext } from './fixtures/catalog-policy-context.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationOf = async (suffix) => normalize(await read(`../migrations/${migrations.find((name) => name.endsWith(suffix))}`));
const refreshMigration = await migrationOf('_oauth_delegated_refresh_tokens.sql');
const migration = await migrationOf('_oauth_consent_spend_limit.sql');
assert(migration.includes(normalize(await read('../schemas/public/functions/consume_oauth_code_and_issue_delegated_grant.sql'))),
  'the migration ships the schema definition of consume_oauth_code_and_issue_delegated_grant');
const codesSql = normalize(await read('../schemas/public/tables/oauth_authorization_codes.sql'));
assert(codesSql.includes('"key_monthly_limit_cost_nanos" bigint,'), 'the codes table definition has the column');
assert(!normalize(await read('../schemas/public/tables/oauth_authorizations.sql')).includes('key_monthly_limit_cost_nanos'),
  'the limit is not shared through the authorization');

const db = new PGlite();
const workspace = '10000000-0000-4000-8000-000000000001';
const user = '30000000-0000-4000-8000-000000000001';
const value = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
const keyLimit = async (keyId) => (await value(
  `select public.gateway_fetch_request_context_without_workspace_budget($1, 'lab/model', 'text.generate', $2) as value`, [workspace, keyId])).key_limit_ok;
const keyOf = async (clientId) => (await db.query(
  `select * from public.keys where oauth_client_id = $1 and status not in ('revoked', 'compromised', 'deleted')`, [clientId])).rows;
let sequence = 0;

// What /oauth/authorize/approve stores with each code: the approved amount, 0 for "No limit", or nothing
// (NULL) for a first-party app or a code issued before the consent screen asked.
async function approve(clientId, monthlyLimit) {
  const codeId = `40000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  await db.query(
    `insert into public.oauth_authorization_codes (id, user_id, workspace_id, client_id, scopes, expires_at, key_monthly_limit_cost_nanos)
     values ($1, $2, $3, $4, array['gateway:access'], now() + interval '10 minutes', $5)`,
    [codeId, user, workspace, clientId, monthlyLimit],
  );
  return codeId;
}
async function exchange(codeId, clientId) {
  const kid = `kid${String(sequence).padStart(9, '0')}${clientId.length}`;
  return value(
    `select public.consume_oauth_code_and_issue_delegated_grant($1, $2, $3, $4, $5, $6, $7, $8, array['gateway:access'], null, $9, now() + interval '90 days') as value`,
    [codeId, `hash-${codeId}`, kid, kid.slice(0, 6), `OAuth: ${clientId}`, user, workspace, clientId, `refresh-${codeId}`],
  );
}
const spend = (keyId, costNanos, success = true) => db.query(
  `insert into public.gateway_requests(id, created_at, workspace_id, request_id, key_id, success, cost_nanos)
   values (gen_random_uuid(), now(), $1, gen_random_uuid()::text, $2, $3, $4)`, [workspace, keyId, success, costNanos]);

try {
  await db.exec(await read('./fixtures/context-bundle-before.sql'));
  await installCatalogPolicyContext(db);
  await db.exec(`
    alter table public.gateway_requests
      add column if not exists key_id uuid, add column if not exists success boolean,
      add column if not exists cost_nanos bigint, add column if not exists detail_metadata jsonb;
    alter table public.byok_keys add column if not exists name text;
    create table public.workspace_budgets (id uuid primary key, workspace_id uuid, interval text, limit_nanos bigint,
      created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.gateway_wallet_reservations (workspace_id uuid, reservation_id text, amount_nanos bigint, status text,
      hold_ref_id text, created_at timestamptz default now(), settled_amount_nanos bigint, captured_nanos bigint default 0,
      released_nanos bigint default 0, key_id uuid);
    -- The key columns the code exchange leaves to their defaults.
    alter table public.keys add primary key (id), alter column id set default gen_random_uuid(),
      alter column created_at set default now(), alter column soft_blocked set default false,
      alter column daily_limit_requests set default 0, alter column weekly_limit_requests set default 0,
      alter column monthly_limit_requests set default 0, alter column daily_limit_cost_nanos set default 0,
      alter column weekly_limit_cost_nanos set default 0, alter column monthly_limit_cost_nanos set default 0;
    create unique index keys_oauth_delegated_active_idx on public.keys (oauth_user_id, workspace_id, oauth_client_id)
      where key_kind = 'oauth_delegated' and status = 'active' and issued_via <> 'desktop';
    create table public.workspace_members (workspace_id uuid not null, user_id uuid not null, primary key (workspace_id, user_id));
    create table public.oauth_authorizations (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, client_id text not null, workspace_id uuid not null,
      scopes text[] not null default '{}', revoked_at timestamptz, unique (user_id, client_id, workspace_id)
    );
    create table public.oauth_authorization_codes (
      id uuid primary key, user_id uuid not null, workspace_id uuid not null, client_id text not null, scopes text[] not null,
      resource text, expires_at timestamptz not null, used_at timestamptz
    );
    create table public.oauth_refresh_tokens (
      id uuid primary key default gen_random_uuid(), token_hash text not null unique, user_id uuid not null, workspace_id uuid not null,
      client_id text not null, scopes text[] not null default '{}', expires_at timestamptz, revoked_at timestamptz,
      rotated_from uuid references public.oauth_refresh_tokens(id), created_at timestamptz not null default now(),
      last_used_at timestamptz, family_id uuid not null
    );
  `);
  for (const path of ['public/functions/gateway_workspace_budget_status.sql', 'public/functions/gateway_fetch_request_context_without_workspace_budget.sql']) {
    await db.exec(await read(`../schemas/${path}`));
  }
  await db.exec(refreshMigration);
  await db.exec(migration);
  await db.exec(`
    insert into public.workspaces(id, created_at, tier) values ('${workspace}', now(), 'basic');
    insert into public.wallets(workspace_id, balance_nanos, reserved_nanos) values ('${workspace}', 500000000000, 0);
    insert into public.workspace_members values ('${workspace}', '${user}');
    insert into public.oauth_authorizations(user_id, client_id, workspace_id, scopes) values
      ('${user}', 'capped_app', '${workspace}', array['gateway:access']),
      ('${user}', 'unlimited_app', '${workspace}', array['gateway:access']),
      ('${user}', 'legacy_app', '${workspace}', array['gateway:access']),
      ('${user}', 'two_tabs_app', '${workspace}', array['gateway:access']);
  `);
  await assert.rejects(approve('capped_app', -1), /check/, 'a negative limit is refused');

  // The exchange gives the new key the limit approved with its code.
  assert.equal((await exchange(await approve('capped_app', 20_000_000_000), 'capped_app')).status, 'issued');
  assert.equal((await exchange(await approve('unlimited_app', 0), 'unlimited_app')).status, 'issued');
  assert.equal((await exchange(await approve('legacy_app', null), 'legacy_app')).status, 'issued');
  const [capped] = await keyOf('capped_app');
  const [unlimited] = await keyOf('unlimited_app');
  const [legacy] = await keyOf('legacy_app');
  assert.equal(Number(capped.monthly_limit_cost_nanos), 20_000_000_000, 'the key gets the $20 a month approved on the consent screen');
  assert.equal(Number(unlimited.monthly_limit_cost_nanos), 0, '"No limit" is stored as 0, the key columns\' no-limit value');
  assert.equal(Number(legacy.monthly_limit_cost_nanos), 0, 'a code without an approved amount issues the key without a limit, as before');

  // The gateway's existing per-key check enforces it.
  await spend(capped.id, 19_990_000_000);
  await spend(capped.id, 50_000_000_000, false);
  assert.equal((await keyLimit(capped.id)).ok, true, 'under the limit (failed requests cost nothing)');
  await spend(capped.id, 10_000_000);
  const reached = await keyLimit(capped.id);
  assert.equal(reached.ok, false);
  assert.equal(reached.reason, 'monthly_cost_limit_reached');
  assert.equal(Number(reached.limit_value), 20_000_000_000);
  assert.equal(Number(reached.current_value), 20_000_000_000);

  await spend(unlimited.id, 100_000_000_000);
  assert.equal((await keyLimit(unlimited.id)).ok, true, 'no limit means no limit');

  // Approving the app again renews the same key, so the month's spend still counts against the new consent.
  const renewed = await exchange(await approve('capped_app', 20_000_000_000), 'capped_app');
  assert.equal(renewed.status, 'renewed');
  assert.equal(renewed.kid, capped.kid);
  const renewedKeys = await keyOf('capped_app');
  assert.equal(renewedKeys.length, 1, 'still one key for the app');
  assert.equal(renewedKeys[0].id, capped.id, 'the same key, so the month is not restarted');
  const stillReached = await keyLimit(capped.id);
  assert.equal(stillReached.ok, false, 're-approving does not reset the monthly allowance');
  assert.equal(Number(stillReached.current_value), 20_000_000_000);

  // The amount the person just approved wins on renewal: raising it lets the key spend again.
  assert.equal((await exchange(await approve('capped_app', 50_000_000_000), 'capped_app')).status, 'renewed');
  assert.equal(Number((await keyOf('capped_app'))[0].monthly_limit_cost_nanos), 50_000_000_000);
  assert.equal((await keyLimit(capped.id)).ok, true);
  // A renewal from a code without an amount keeps the key's limit.
  assert.equal((await exchange(await approve('capped_app', null), 'capped_app')).status, 'renewed');
  assert.equal(Number((await keyOf('capped_app'))[0].monthly_limit_cost_nanos), 50_000_000_000);

  // Two approvals outstanding at once: each code carries its own amount, whatever order they are exchanged in.
  const tenDollarCode = await approve('two_tabs_app', 10_000_000_000);
  const thirtyDollarCode = await approve('two_tabs_app', 30_000_000_000);
  assert.equal((await exchange(tenDollarCode, 'two_tabs_app')).status, 'issued');
  assert.equal(Number((await keyOf('two_tabs_app'))[0].monthly_limit_cost_nanos), 10_000_000_000, 'the first code gets its own $10, not the later $30');
  assert.equal((await exchange(thirtyDollarCode, 'two_tabs_app')).status, 'renewed');
  assert.equal(Number((await keyOf('two_tabs_app'))[0].monthly_limit_cost_nanos), 30_000_000_000);
  assert.equal((await keyOf('two_tabs_app')).length, 1);

  // A paused key is neither revived nor re-limited by a new approval.
  await db.query(`update public.keys set status = 'paused' where id = $1`, [capped.id]);
  assert.equal((await exchange(await approve('capped_app', 0), 'capped_app')).status, 'key_inactive');
  const paused = await value('select row_to_json(k) as value from public.keys k where id = $1', [capped.id]);
  assert.equal(paused.status, 'paused');
  assert.equal(Number(paused.monthly_limit_cost_nanos), 50_000_000_000);

  // The person can change it later where key limits are edited; the next check uses the new value.
  await db.query(`update public.keys set status = 'active', monthly_limit_cost_nanos = 100000000000 where id = $1`, [capped.id]);
  assert.equal((await keyLimit(capped.id)).ok, true);

  console.log('oauth-consent-spend-limit: all assertions passed');
} finally {
  await db.close();
}
