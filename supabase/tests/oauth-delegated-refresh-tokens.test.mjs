// Standalone PostgreSQL regression test: third-party OAuth apps get a refresh token with their delegated
// gateway key. The code exchange issues both at once; refreshing rotates the refresh token and gives
// the same key a new secret; scopes never widen; a refresh token presented again after rotation ends
// its chain and the key; and revoking the key or the app's consent ends its refresh tokens.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/oauth-delegated-refresh-tokens.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_oauth_delegated_refresh_tokens.sql'));
const migration = await read(`../migrations/${migrationName}`);
for (const name of [
  'consume_oauth_code_and_issue_delegated_grant',
  'rotate_oauth_delegated_refresh_token',
  'revoke_oauth_refresh_tokens_for_inactive_key',
  'revoke_oauth_grant_on_authorization_revoke',
]) {
  const functionSql = await read(`../schemas/public/functions/${name}.sql`);
  assert(normalize(migration).includes(normalize(functionSql)), `the migration ships the schema definition of ${name}`);
}
const tableSql = normalize(await read('../schemas/public/tables/oauth_refresh_tokens.sql'));
assert(tableSql.includes('"key_id"       uuid,') && tableSql.includes('REFERENCES public.keys(id) ON DELETE CASCADE'), 'the table definition has key_id');
for (const [table, trigger] of [['keys', 'revoke_oauth_refresh_tokens_for_inactive_key'], ['oauth_authorizations', 'revoke_oauth_grant_on_authorization_revoke'], ['oauth_authorizations', 'revoke_oauth_grant_on_authorization_delete']]) {
  const definition = normalize(await read(`../schemas/public/tables/${table}.sql`));
  const start = definition.indexOf(`CREATE TRIGGER ${trigger}\n`);
  assert(start >= 0, `${table}.sql defines ${trigger}`);
  const statement = definition.slice(start, definition.indexOf(';', start) + 1);
  assert(normalize(migration).includes(statement), `the migration creates ${trigger} as defined`);
}

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = id(1);
const WS = id(2);
const db = new PGlite();
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
let codeSequence = 100;

async function authorize(clientId, scopes) {
  await db.query(
    `insert into public.oauth_authorizations (user_id, workspace_id, client_id, scopes) values ($1, $2, $3, $4)`,
    [USER, WS, clientId, scopes],
  );
}

async function exchange(clientId, scopes, kid, refreshHash, resource = null) {
  const codeId = id(++codeSequence);
  await db.query(
    `insert into public.oauth_authorization_codes (id, user_id, workspace_id, client_id, scopes, resource, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + interval '10 minutes')`,
    [codeId, USER, WS, clientId, scopes, resource],
  );
  const result = (await one(
    `select public.consume_oauth_code_and_issue_delegated_grant($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now() + interval '90 days') r`,
    [codeId, `hash-${kid}`, kid, kid.slice(0, 6), `OAuth: ${clientId}`, USER, WS, clientId, scopes, resource, refreshHash],
  )).r;
  return { result, codeId };
}

const rotate = async (current, next, keyHash) => (await one(
  `select public.rotate_oauth_delegated_refresh_token($1, $2, now() + interval '90 days', $3) r`, [current, next, keyHash])).r;
const token = (hash) => one('select * from public.oauth_refresh_tokens where token_hash = $1', [hash]);
const key = (kid) => one('select * from public.keys where kid = $1', [kid]);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.workspace_members (workspace_id uuid not null, user_id uuid not null, primary key (workspace_id, user_id));
    create table public.oauth_authorizations (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, workspace_id uuid not null, client_id text not null,
      scopes text[] not null default '{}', revoked_at timestamptz, unique (user_id, client_id, workspace_id)
    );
    create table public.oauth_authorization_codes (
      id uuid primary key, user_id uuid not null, workspace_id uuid not null, client_id text not null, scopes text[] not null,
      resource text, expires_at timestamptz not null, used_at timestamptz
    );
    create table public.keys (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null, name text not null, hash text not null unique,
      prefix text not null, status text not null default 'active', scopes text not null, created_by uuid not null, kid text unique,
      key_kind text not null default 'standard', oauth_client_id text, oauth_user_id uuid, oauth_scopes text[], oauth_resource text,
      issued_via text not null default 'dashboard', expires_at timestamptz, revoked_at timestamptz, revoked_reason text,
      monthly_limit_cost_nanos bigint not null default 0,
      constraint keys_active_oauth_delegated_gateway_scope_check check (key_kind <> 'oauth_delegated' or status <> 'active'
        or (nullif(btrim(oauth_resource), '') is not null and not coalesce(btrim(oauth_resource) ~* '^https://api\\.phaseo\\.app(?::443)?/v1/*$', false))
        or coalesce(oauth_scopes, array[]::text[]) @> array['gateway:access'])
    );
    create table public.oauth_refresh_tokens (
      id uuid primary key default gen_random_uuid(), token_hash text not null unique, user_id uuid not null, workspace_id uuid not null,
      client_id text not null, scopes text[] not null default '{}', expires_at timestamptz, revoked_at timestamptz,
      rotated_from uuid references public.oauth_refresh_tokens(id), created_at timestamptz not null default now(),
      last_used_at timestamptz, family_id uuid not null
    );
    insert into public.workspace_members values ('${WS}', '${USER}');
  `);
  await db.exec(migration);

  // The exchange issues the key and a refresh token bound to it, once.
  await authorize('partner_app', ['gateway:access', 'models:read']);
  const first = await exchange('partner_app', ['gateway:access', 'models:read'], 'kidAAAAAAAAA', 'refresh-1');
  assert.equal(first.result, 'issued');
  const issuedKey = await key('kidAAAAAAAAA');
  assert.equal(issuedKey.status, 'active');
  assert.equal(issuedKey.key_kind, 'oauth_delegated');
  const firstToken = await token('refresh-1');
  assert.equal(firstToken.key_id, issuedKey.id, 'the refresh token renews the issued key');
  assert.deepEqual(firstToken.scopes, ['gateway:access', 'models:read']);
  assert.ok(firstToken.family_id);
  assert.ok(Date.parse(firstToken.expires_at) > Date.now() + 89 * 86400_000, 'the refresh token lasts 90 days');
  const replayedCode = (await one(
    `select public.consume_oauth_code_and_issue_delegated_grant($1, 'hash-x', 'kidXXXXXXXXX', 'kidXXX', 'x', $2, $3, 'partner_app', array['gateway:access', 'models:read'], null, 'refresh-x', now() + interval '90 days') r`,
    [first.codeId, USER, WS],
  )).r;
  assert.equal(replayedCode, 'invalid', 'a code is exchanged once');
  assert.equal(await token('refresh-x'), undefined);

  // Refreshing rotates the refresh token and replaces the same key's secret.
  await db.exec(`update public.keys set expires_at = now() - interval '1 hour', monthly_limit_cost_nanos = 20000000000 where kid = 'kidAAAAAAAAA'`);
  const rotated = await rotate('refresh-1', 'refresh-2', 'hash-2');
  assert.equal(rotated.status, 'rotated');
  assert.equal(rotated.kid, 'kidAAAAAAAAA');
  assert.deepEqual(rotated.scopes, ['gateway:access', 'models:read']);
  const renewedKey = await key('kidAAAAAAAAA');
  assert.equal(renewedKey.id, issuedKey.id, 'the same key row');
  assert.equal(renewedKey.hash, 'hash-2', 'the old secret no longer matches');
  assert.equal(Number(renewedKey.monthly_limit_cost_nanos), 20_000_000_000, 'its limits carry over');
  assert.ok(Date.parse(renewedKey.expires_at) > Date.now() + 6 * 86400_000, 'an expired access token is renewed for 7 days');
  assert.equal(Number((await one('select count(*) n from public.keys')).n), 1, 'no new key');
  const secondToken = await token('refresh-2');
  assert.equal(secondToken.rotated_from, firstToken.id);
  assert.equal(secondToken.family_id, firstToken.family_id);
  assert.equal(secondToken.key_id, issuedKey.id);
  assert.ok((await token('refresh-1')).revoked_at, 'the used refresh token is spent');

  // Scopes never widen, and narrow with the authorization.
  await db.exec(`update public.oauth_authorizations set scopes = array['gateway:access', 'models:read', 'keys:write'] where client_id = 'partner_app'`);
  const notWidened = await rotate('refresh-2', 'refresh-3', 'hash-3');
  assert.deepEqual(notWidened.scopes, ['gateway:access', 'models:read'], 'a later consent never widens a refreshed token');
  assert.deepEqual((await key('kidAAAAAAAAA')).oauth_scopes, ['gateway:access', 'models:read']);
  await db.exec(`update public.oauth_authorizations set scopes = array['gateway:access'] where client_id = 'partner_app'`);
  const narrowed = await rotate('refresh-3', 'refresh-4', 'hash-4');
  assert.deepEqual(narrowed.scopes, ['gateway:access']);
  assert.deepEqual((await key('kidAAAAAAAAA')).oauth_scopes, ['gateway:access']);

  // Without gateway access consent, a credit-spending key cannot be refreshed.
  await db.exec(`update public.oauth_authorizations set scopes = array['models:read'] where client_id = 'partner_app'`);
  assert.equal((await rotate('refresh-4', 'refresh-5', 'hash-5')).status, 'invalid');
  assert.equal((await token('refresh-4')).revoked_at, null, 'a refused refresh does not spend the token');
  assert.equal((await key('kidAAAAAAAAA')).hash, 'hash-4');
  await db.exec(`update public.oauth_authorizations set scopes = array['gateway:access'] where client_id = 'partner_app'`);

  // Reusing a rotated refresh token ends the chain and the key.
  assert.equal((await rotate('refresh-2', 'refresh-stolen', 'hash-stolen')).status, 'reused');
  const chain = (await db.query('select revoked_at from public.oauth_refresh_tokens where family_id = $1', [firstToken.family_id])).rows;
  assert.ok(chain.length === 4 && chain.every((row) => row.revoked_at), 'every token in the chain is revoked');
  const reusedKey = await key('kidAAAAAAAAA');
  assert.equal(reusedKey.status, 'revoked');
  assert.equal(reusedKey.revoked_reason, 'oauth_refresh_token_reused');
  assert.equal(reusedKey.hash, 'hash-4', 'the replayed refresh issued nothing');
  assert.equal(await token('refresh-stolen'), undefined);

  // A key that is disabled (or revoked) can't be refreshed, and its tokens stay ended if it is turned back on.
  await authorize('disabled_app', ['gateway:access']);
  assert.equal((await exchange('disabled_app', ['gateway:access'], 'kidBBBBBBBBB', 'disabled-1')).result, 'issued');
  await db.exec(`update public.keys set status = 'disabled' where kid = 'kidBBBBBBBBB'`);
  assert.ok((await token('disabled-1')).revoked_at, 'disabling the key ends its refresh tokens');
  await db.exec(`update public.keys set status = 'active' where kid = 'kidBBBBBBBBB'`);
  assert.equal((await rotate('disabled-1', 'disabled-2', 'hash-b2')).status, 'invalid');
  assert.equal((await key('kidBBBBBBBBB')).status, 'active', 'a refresh token revoked by turning the key off is not treated as reuse');

  // A new sign-in replaces the app's key, which ends the old key's refresh tokens.
  await authorize('replaced_app', ['gateway:access']);
  assert.equal((await exchange('replaced_app', ['gateway:access'], 'kidCCCCCCCCC', 'replaced-1')).result, 'issued');
  assert.equal((await exchange('replaced_app', ['gateway:access'], 'kidDDDDDDDDD', 'replacement-1')).result, 'issued');
  assert.equal((await key('kidCCCCCCCCC')).status, 'revoked');
  assert.ok((await token('replaced-1')).revoked_at);
  assert.equal((await rotate('replaced-1', 'replaced-2', 'hash-c2')).status, 'invalid');
  assert.equal((await rotate('replacement-1', 'replacement-2', 'hash-d2')).status, 'rotated');

  // Revoking the app's consent revokes its keys and refresh tokens; consenting again revives neither.
  await authorize('revoked_app', ['gateway:access']);
  assert.equal((await exchange('revoked_app', ['gateway:access'], 'kidEEEEEEEEE', 'consent-1')).result, 'issued');
  await db.exec(`update public.oauth_authorizations set revoked_at = now() where client_id = 'revoked_app'`);
  assert.equal((await key('kidEEEEEEEEE')).status, 'revoked');
  assert.ok((await token('consent-1')).revoked_at);
  await db.exec(`update public.oauth_authorizations set revoked_at = null where client_id = 'revoked_app'`);
  assert.equal((await rotate('consent-1', 'consent-2', 'hash-e2')).status, 'invalid');

  // Deleting the authorization does the same; deleting the key deletes its refresh tokens.
  await authorize('deleted_app', ['gateway:access']);
  assert.equal((await exchange('deleted_app', ['gateway:access'], 'kidFFFFFFFFF', 'deleted-1')).result, 'issued');
  await db.exec(`delete from public.oauth_authorizations where client_id = 'deleted_app'`);
  assert.equal((await key('kidFFFFFFFFF')).status, 'revoked');
  assert.ok((await token('deleted-1')).revoked_at);
  await db.exec(`delete from public.keys where kid = 'kidFFFFFFFFF'`);
  assert.equal(await token('deleted-1'), undefined);

  // Leaving the workspace ends refreshes; so does an expired refresh token.
  await authorize('member_app', ['gateway:access']);
  assert.equal((await exchange('member_app', ['gateway:access'], 'kidGGGGGGGGG', 'member-1')).result, 'issued');
  await db.exec(`update public.oauth_refresh_tokens set expires_at = now() - interval '1 minute' where token_hash = 'replacement-2'`);
  assert.equal((await rotate('replacement-2', 'replacement-3', 'hash-d3')).status, 'invalid');
  await db.exec(`delete from public.workspace_members where user_id = '${USER}'`);
  assert.equal((await rotate('member-1', 'member-2', 'hash-g2')).status, 'invalid');
  assert.equal((await key('kidGGGGGGGGG')).hash, 'hash-kidGGGGGGGGG');

  // The CLI's refresh tokens (no key) are not this function's to rotate.
  await db.exec(`
    insert into public.workspace_members values ('${WS}', '${USER}');
    insert into public.oauth_refresh_tokens (token_hash, user_id, workspace_id, client_id, scopes, family_id)
    values ('cli-1', '${USER}', '${WS}', 'phaseo_cli', array['openid'], gen_random_uuid());
  `);
  assert.equal((await rotate('cli-1', 'cli-2', 'hash-cli')).status, 'invalid');

  console.log('oauth-delegated-refresh-tokens: all assertions passed');
} finally {
  await db.close();
}
