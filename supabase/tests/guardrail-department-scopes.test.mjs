// Standalone PostgreSQL regression test for public.guardrail_department_scopes: for every key (not
// deleted) and member of a workspace, the departments spend_scope_departments counts for them, which
// Settings, Guardrails uses to show department guardrails on the keys and members they reach.
// Checks: the migration and schema file match and are in the manifest; a key's own department wins;
// an unlinked key and a member count all of the principal's departments, or only the primary one with
// primary attribution; an override replaces them; an OAuth key goes through its OAuth user; deleted
// keys, other workspaces and people with no department are left out; service role only.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/guardrail-department-scopes.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createGuardrailLevelsBase } from './fixtures/guardrail-levels-before.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_guardrail_department_scopes.sql'));
assert(migrationName, 'the migration exists');
const migration = await read(`../migrations/${migrationName}`);
const file = 'public/functions/guardrail_department_scopes.sql';
assert(normalize(migration).includes(normalize(await read(`../schemas/${file}`))), `${file} is in ${migrationName}`);
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const list of ['loadOrder', 'files']) assert(manifest[list].includes(file), `${file} is in the manifest's ${list}`);
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/guardrail-department-scopes\.test\.mjs/, 'CI runs this suite');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [W1, W2] = [id(1), id(2)];
const [D1, D2, DFOREIGN] = [id(41), id(42), id(43)];
const [U1, U2, U3] = [id(31), id(32), id(33)];
const [KLINK, KU1, KU2, KOAUTH, KNONE, KGONE, KFOREIGN] = [id(21), id(22), id(23), id(24), id(25), id(26), id(27)];
const short = (value) => value.slice(-2);

const db = new PGlite();
const scopes = async (workspaceId) => (await db.query('select * from public.guardrail_department_scopes($1)', [workspaceId])).rows
  .map((row) => `${row.target_type}:${short(row.target_id)}:${short(row.department_id)}`);

try {
  await createGuardrailLevelsBase(db);
  await db.exec(`
    alter table public.keys add column status text not null default 'active';
    create table public.workspace_members (workspace_id uuid not null, user_id uuid not null, primary key (workspace_id, user_id));
    insert into public.workspaces values ('${W1}'), ('${W2}');
    insert into public.users values ('${U1}'), ('${U2}'), ('${U3}');
    insert into public.workspace_members values ('${W1}', '${U1}'), ('${W1}', '${U2}'), ('${W1}', '${U3}'), ('${W2}', '${U1}');
    insert into public.workspace_departments values ('${D1}', '${W1}'), ('${D2}', '${W1}'), ('${DFOREIGN}', '${W2}');
    insert into public.workspace_department_grants (workspace_id, user_id, department_id, source_type, is_primary, created_at) values
      ('${W1}', '${U1}', '${D1}', 'manual', true, now() - interval '1 day'),
      ('${W1}', '${U1}', '${D2}', 'scim_group', false, now()),
      ('${W1}', '${U2}', '${D1}', 'manual', true, now()),
      ('${W2}', '${U1}', '${DFOREIGN}', 'manual', true, now());
    insert into public.workspace_member_overrides (workspace_id, user_id, department_override_enabled, department_id) values ('${W1}', '${U2}', true, '${D2}');
    insert into public.keys (id, workspace_id, created_by, oauth_user_id, key_kind, department_id, status) values
      ('${KLINK}', '${W1}', '${U1}', null, 'standard', '${D2}', 'active'),
      ('${KU1}', '${W1}', '${U1}', null, 'standard', null, 'active'),
      ('${KU2}', '${W1}', '${U2}', null, 'standard', null, 'disabled'),
      ('${KOAUTH}', '${W1}', '${U3}', '${U1}', 'oauth_delegated', '${D2}', 'active'),
      ('${KNONE}', '${W1}', '${U3}', null, 'standard', null, 'active'),
      ('${KGONE}', '${W1}', '${U1}', null, 'standard', '${D1}', 'deleted'),
      ('${KFOREIGN}', '${W2}', '${U1}', null, 'standard', null, 'active');
  `);
  await db.exec(migration);

  assert.deepEqual(await scopes(W1), [
    'key:21:42', // its own department only
    'key:22:41', 'key:22:42', // every department of its creator
    'key:23:42', // its creator's override (a disabled key is still listed: it can be turned back on)
    'key:24:41', 'key:24:42', // an OAuth key goes through its OAuth user, not department_id
    'member:31:41', 'member:31:42',
    'member:32:42',
  ], 'keys and members with the departments the gateway counts; deleted keys and people with none are left out');
  assert.deepEqual(await scopes(W2), ['key:27:43', 'member:31:43'], 'each workspace only lists its own');

  await db.exec(`insert into public.workspace_settings (workspace_id, department_spend_attribution) values ('${W1}', 'primary')`);
  assert.deepEqual((await scopes(W1)).filter((row) => row.includes(':22:') || row.startsWith('member:31')), ['key:22:41', 'member:31:41'],
    'with primary attribution only the primary department counts');

  const grants = (await db.query(`select has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') authenticated,
      has_function_privilege('service_role', p.oid, 'execute') service from pg_proc p where p.proname = 'guardrail_department_scopes'`)).rows;
  assert.deepEqual(grants, [{ anon: false, authenticated: false, service: true }], 'service role only');
  console.log('guardrail department scopes: ok');
} finally {
  await db.close();
}
