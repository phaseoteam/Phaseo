// Standalone PostgreSQL regression test for the CLI OAuth scope allowlist migration: phaseo_cli
// gains the BYOK, private model and feedback scopes, keeps what it had, gets no duplicates when
// the migration runs twice, and no other client changes.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/cli-oauth-scopes.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const migrationsDir = new URL('../migrations/', import.meta.url);
const migrationName = (await readdir(migrationsDir)).find((name) => name.endsWith('_cli_oauth_byok_private_models_feedback_scopes.sql'));
assert.ok(migrationName, 'CLI OAuth scope migration is missing');
const migration = await readFile(new URL(migrationName, migrationsDir), 'utf8');
assert.doesNotMatch(migration, /^\s*(delete|drop|truncate)\b/im, 'the migration must only add scopes');

const db = new PGlite();
const scopes = async (id) => (await db.query('select allowed_scopes from public.oauth_clients where id = $1', [id])).rows[0].allowed_scopes;

await db.exec(`
  create table public.oauth_clients (id text primary key, allowed_scopes text[], updated_at timestamptz);
  insert into public.oauth_clients values
    ('phaseo_cli', array['keys:read', 'private_models:read', 'spend_rules:read'], null),
    ('other', array['keys:read'], null);
`);
await db.exec(migration);
await db.exec(migration);

assert.deepEqual(await scopes('phaseo_cli'), [
	'feedback:read',
	'feedback:write',
	'keys:read',
	'private_models:delete',
	'private_models:read',
	'private_models:write',
	'provider_credentials:delete',
	'provider_credentials:read',
	'provider_credentials:write',
	'spend_rules:read',
]);
assert.deepEqual(await scopes('other'), ['keys:read']);
assert.ok((await db.query(`select updated_at from public.oauth_clients where id = 'phaseo_cli'`)).rows[0].updated_at);
assert.equal((await db.query(`select updated_at from public.oauth_clients where id = 'other'`)).rows[0].updated_at, null);

await db.close();
console.log('cli-oauth-scopes: ok');
