// Standalone PostgreSQL regression test: the monthly spending limit a person chooses for an OAuth app on
// the consent screen becomes the app's delegated key's monthly cost limit, and the request-context check
// the gateway already runs for every key refuses the key's requests once the month's spend reaches it.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/oauth-consent-spend-limit.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { installCatalogPolicyContext } from './fixtures/catalog-policy-context.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_oauth_consent_spend_limit.sql'));
const migration = normalize(await read(`../migrations/${migrationName}`));
assert(migration.includes(normalize(await read('../schemas/public/functions/apply_oauth_consent_spend_limit.sql'))),
  'the migration ships the schema definition of apply_oauth_consent_spend_limit');
const keysSql = normalize(await read('../schemas/public/tables/keys.sql'));
const trigger = keysSql.slice(keysSql.indexOf('CREATE TRIGGER apply_oauth_consent_spend_limit\n'));
assert(migration.includes(trigger.slice(0, trigger.indexOf(';') + 1)), 'the migration creates the trigger as defined');
const authorizationsSql = normalize(await read('../schemas/public/tables/oauth_authorizations.sql'));
assert(authorizationsSql.includes('"key_monthly_limit_cost_nanos" bigint,'), 'the table definition has the column');

const db = new PGlite();
const workspace = '10000000-0000-4000-8000-000000000001';
const user = '30000000-0000-4000-8000-000000000001';
const capped = '20000000-0000-4000-8000-000000000001';
const unlimited = '20000000-0000-4000-8000-000000000002';
const legacy = '20000000-0000-4000-8000-000000000003';
const desktop = '20000000-0000-4000-8000-000000000004';
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const keyLimit = async (keyId) => (await one(
  `select public.gateway_fetch_request_context_without_workspace_budget($1, 'lab/model', 'text.generate', $2) as value`, [workspace, keyId])).key_limit_ok;
const monthlyLimitOf = async (keyId) => Number(await one('select monthly_limit_cost_nanos as value from public.keys where id = $1', [keyId]));

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
    create table public.oauth_authorizations (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, client_id text not null, workspace_id uuid not null,
      scopes text[] not null default '{}', revoked_at timestamptz, unique (user_id, client_id, workspace_id)
    );
  `);
  for (const path of ['public/functions/gateway_workspace_budget_status.sql', 'public/functions/gateway_fetch_request_context_without_workspace_budget.sql']) {
    await db.exec(await read(`../schemas/${path}`));
  }
  await db.exec(migration);

  // What /oauth/authorize/approve stores: $20 for one app, no limit (0) for another, nothing for an old consent.
  await db.exec(`
    insert into public.workspaces(id, created_at, tier) values ('${workspace}', now(), 'basic');
    insert into public.wallets(workspace_id, balance_nanos, reserved_nanos) values ('${workspace}', 500000000000, 0);
    insert into public.oauth_authorizations(user_id, client_id, workspace_id, scopes, key_monthly_limit_cost_nanos) values
      ('${user}', 'capped_app', '${workspace}', array['gateway:access'], 20000000000),
      ('${user}', 'unlimited_app', '${workspace}', array['gateway:access'], 0),
      ('${user}', 'legacy_app', '${workspace}', array['gateway:access'], null),
      ('${user}', 'phaseo_desktop', '${workspace}', array['gateway:access'], 20000000000);
  `);
  await assert.rejects(db.exec(`update public.oauth_authorizations set key_monthly_limit_cost_nanos = -1 where client_id = 'capped_app'`), /check/);

  // The code exchange inserts the key; the trigger gives it the chosen limit.
  const insertKey = (id, client, issuedVia, monthlyLimit = 0) => db.query(
    `insert into public.keys(id, workspace_id, name, status, soft_blocked, created_at, created_by, kid, key_kind, oauth_client_id, oauth_user_id,
       oauth_scopes, issued_via, daily_limit_requests, weekly_limit_requests, monthly_limit_requests,
       daily_limit_cost_nanos, weekly_limit_cost_nanos, monthly_limit_cost_nanos)
     values ($1, $2, $3, 'active', false, now(), $4, $5, 'oauth_delegated', $6, $4, array['gateway:access'], $7, 0, 0, 0, 0, 0, $8)`,
    [id, workspace, `OAuth: ${client}`, user, id.slice(-6), client, issuedVia, monthlyLimit]);
  await insertKey(capped, 'capped_app', 'oauth_pkce');
  await insertKey(unlimited, 'unlimited_app', 'oauth_pkce', 5);
  await insertKey(legacy, 'legacy_app', 'oauth_pkce', 7);
  await insertKey(desktop, 'phaseo_desktop', 'desktop');
  assert.equal(await monthlyLimitOf(capped), 20_000_000_000, 'the key gets the $20 a month chosen on the consent screen');
  assert.equal(await monthlyLimitOf(unlimited), 0, '"No limit" is stored as 0, the key columns\' no-limit value');
  assert.equal(await monthlyLimitOf(legacy), 7, 'an authorization without a choice leaves the key as issued');
  assert.equal(await monthlyLimitOf(desktop), 0, 'only keys issued through the consent flow are affected');

  // The gateway's existing per-key check enforces it.
  const spend = (keyId, costNanos, success = true) => db.query(
    `insert into public.gateway_requests(id, created_at, workspace_id, request_id, key_id, success, cost_nanos)
     values (gen_random_uuid(), now(), $1, gen_random_uuid()::text, $2, $3, $4)`, [workspace, keyId, success, costNanos]);
  await spend(capped, 19_990_000_000);
  await spend(capped, 50_000_000_000, false);
  assert.equal((await keyLimit(capped)).ok, true, 'under the limit (failed requests cost nothing)');
  await spend(capped, 10_000_000);
  const reached = await keyLimit(capped);
  assert.equal(reached.ok, false);
  assert.equal(reached.reason, 'monthly_cost_limit_reached');
  assert.equal(Number(reached.limit_value), 20_000_000_000);
  assert.equal(Number(reached.current_value), 20_000_000_000);

  await spend(unlimited, 100_000_000_000);
  assert.equal((await keyLimit(unlimited)).ok, true, 'no limit means no limit');

  // The person can change it later where key limits are edited; the next check uses the new value.
  await db.query('update public.keys set monthly_limit_cost_nanos = 50000000000 where id = $1', [capped]);
  assert.equal((await keyLimit(capped)).ok, true);

  console.log('oauth-consent-spend-limit: all assertions passed');
} finally {
  await db.close();
}
