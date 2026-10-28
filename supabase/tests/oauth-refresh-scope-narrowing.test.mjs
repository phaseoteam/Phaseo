// Standalone PostgreSQL regression test: public.rotate_oauth_refresh_token never widens a session.
// A refreshed token keeps the scopes of the token it replaces that the authorization still grants,
// so a later login that opts in to billing:write does not hand it to older CLI sessions. Tokens
// stored without scopes keep the authorization's scopes minus billing:write.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/oauth-refresh-scope-narrowing.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_cli_credit_topups.sql'));
const migration = await read(`../migrations/${migrationName}`);
const functionSql = await read('../schemas/public/functions/rotate_oauth_refresh_token.sql');
assert(normalize(migration).includes(normalize(functionSql)), 'the migration ships the schema definition of rotate_oauth_refresh_token');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = id(1);
const WS = id(2);
const db = new PGlite();
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const rotate = async (current, next) => (await one(
  `select public.rotate_oauth_refresh_token($1, $2, now() + interval '30 days', '{}'::text[]) r`, [current, next])).r;
const scopesOf = async (hash) => (await one('select scopes from public.oauth_refresh_tokens where token_hash = $1', [hash])).scopes;

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.workspace_members (workspace_id uuid not null, user_id uuid not null, primary key (workspace_id, user_id));
    create table public.oauth_authorizations (user_id uuid not null, workspace_id uuid not null, client_id text not null, scopes text[] not null default '{}', revoked_at timestamptz);
    create table public.oauth_refresh_tokens (
      id uuid primary key default gen_random_uuid(), token_hash text not null unique, user_id uuid not null, workspace_id uuid not null,
      client_id text not null, scopes text[] not null default '{}', expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz,
      rotated_from uuid, family_id uuid
    );
    insert into public.workspace_members values ('${WS}', '${USER}');
    -- A later "phaseo login --scopes billing:write" widened the authorization.
    insert into public.oauth_authorizations values ('${USER}', '${WS}', 'phaseo_cli', array['openid', 'credits:read', 'billing:write'], null);
    insert into public.oauth_refresh_tokens (token_hash, user_id, workspace_id, client_id, scopes) values
      ('old-session', '${USER}', '${WS}', 'phaseo_cli', array['openid', 'credits:read']),
      ('opted-in', '${USER}', '${WS}', 'phaseo_cli', array['openid', 'billing:write']),
      ('legacy', '${USER}', '${WS}', 'phaseo_cli', '{}');
  `);
  await db.exec(`SET check_function_bodies = off;\n${functionSql}`);

  assert.equal(await rotate('old-session', 'old-session-2'), 'rotated');
  assert.deepEqual(await scopesOf('old-session-2'), ['openid', 'credits:read'], 'an older session does not gain billing:write');

  assert.equal(await rotate('opted-in', 'opted-in-2'), 'rotated');
  assert.deepEqual(await scopesOf('opted-in-2'), ['openid', 'billing:write'], 'a session that opted in keeps it');

  assert.equal(await rotate('legacy', 'legacy-2'), 'rotated');
  assert.deepEqual(await scopesOf('legacy-2'), ['openid', 'credits:read'], 'tokens without stored scopes drop opt-in scopes');

  // Narrowing the authorization narrows the next refresh too.
  await db.exec(`update public.oauth_authorizations set scopes = array['openid']`);
  assert.equal(await rotate('opted-in-2', 'opted-in-3'), 'rotated');
  assert.deepEqual(await scopesOf('opted-in-3'), ['openid']);

  console.log('oauth-refresh-scope-narrowing: all assertions passed');
} finally {
  await db.close();
}
