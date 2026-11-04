// Standalone PostgreSQL regression test: changes to API keys and workspace budgets queue a gateway
// workspace cache publication, so the gateway's cached key lookups, contexts and policies refresh
// however the row was written.
// Checks: the schema files declare the migration's triggers; the department-only trigger on keys is
// gone; key status, hash, limit and IP-allowlist changes and key deletes queue a publication;
// last_used_at-only updates (authentication usage) queue none; budget inserts, updates and deletes
// queue one; deleting a workspace with keys still works.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/gateway-key-cache-publication.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_gateway_key_cache_publication.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));
const triggerIn = async (file, name) => {
  const text = normalize(await read(`../schemas/${file}`));
  const start = text.indexOf(`CREATE TRIGGER ${name}\n`);
  assert(start >= 0, `${file} declares ${name}`);
  return text.slice(start, text.indexOf(';', start) + 1);
};
for (const file of ['public/tables/keys.sql', 'public/tables/workspace_budgets.sql']) {
  assert(migration.includes(await triggerIn(file, 'gateway_workspace_publication')), `${file}'s publication trigger is in ${migrationName}`);
}
assert(!normalize(await read('../schemas/public/tables/keys.sql')).includes('keys_department_gateway_publication'), 'keys.sql no longer declares the department-only trigger');
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/gateway-key-cache-publication\.test\.mjs/, 'CI runs this suite');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [W1, W2] = [id(1), id(2)];
const [K1, K2, K3] = [id(11), id(12), id(13)];
const [B1] = [id(21)];

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const pending = async () => {
  const result = (await rows('select workspace_id from public.gateway_workspace_publications order by workspace_id')).map((row) => row.workspace_id);
  await db.exec('delete from public.gateway_workspace_publications');
  return result;
};

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.workspaces (id uuid primary key);
    create table public.keys (
      id uuid primary key,
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      status text not null default 'active',
      hash text not null,
      soft_blocked boolean not null default false,
      daily_limit_cost_nanos bigint not null default 0,
      ip_allowlist jsonb not null default '[]'::jsonb,
      department_id uuid,
      last_used_at timestamp with time zone,
      updated_at timestamp with time zone not null default now());
    -- Read by other branches of the capture function.
    create table public.workspace_guardrails (id uuid primary key, workspace_id uuid not null);
    create table public.gateway_dynamic_routes (id uuid primary key, workspace_id uuid not null);
    create table public.workspace_budgets (
      id uuid primary key,
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      interval text not null,
      limit_nanos bigint not null);
  `);
  await db.exec(await read('../schemas/public/tables/gateway_workspace_publications.sql'));
  await db.exec(await read('../schemas/private/functions/enqueue_gateway_workspace_publication.sql'));
  await db.exec(await read('../schemas/private/functions/capture_gateway_workspace_publication.sql'));
  // The state before this migration: only department changes on keys published.
  await db.exec(`
    create trigger keys_department_gateway_publication after update of department_id on public.keys
      for each row when ((old.department_id is distinct from new.department_id))
      execute function private.capture_gateway_workspace_publication();
    insert into public.workspaces values ('${W1}'), ('${W2}');
    insert into public.keys (id, workspace_id, hash) values ('${K1}', '${W1}', 'h1'), ('${K2}', '${W1}', 'h2'), ('${K3}', '${W2}', 'h3');
  `);

  await db.exec(migration);
  assert.deepEqual(
    (await rows(`select tgname from pg_trigger where tgrelid = 'public.keys'::regclass and not tgisinternal order by tgname`)).map((row) => row.tgname),
    ['gateway_workspace_publication'],
    'the department-only trigger is replaced',
  );
  await pending();

  await db.exec(`update public.keys set last_used_at = now(), updated_at = now() where id = '${K1}'`);
  assert.deepEqual(await pending(), [], 'authentication usage writes queue nothing');

  for (const [label, change] of [
    ['a revocation', `status = 'revoked'`],
    ['a soft block', 'soft_blocked = true'],
    ['a hash change', `hash = 'h1-rotated'`],
    ['a limit change', 'daily_limit_cost_nanos = 5'],
    ['an IP allowlist change', `ip_allowlist = '[{"address":"10.0.0.1"}]'::jsonb`],
    ['a department change', `department_id = '${id(31)}'`],
  ]) {
    await db.exec(`update public.keys set ${change} where id = '${K1}'`);
    assert.deepEqual(await pending(), [W1], `${label} queues a publication for the key's workspace`);
  }

  await db.exec(`update public.keys set status = 'deleted' where id = '${K2}'`);
  await db.exec(`update public.keys set status = 'deleted' where id = '${K2}'`);
  assert.deepEqual(await pending(), [W1], 'repeated changes coalesce into one pending publication');

  await db.exec(`delete from public.keys where id = '${K3}'`);
  assert.deepEqual(await pending(), [W2], 'a deleted key queues a publication');

  await db.exec(`insert into public.workspace_budgets values ('${B1}', '${W1}', 'monthly', 100)`);
  assert.deepEqual(await pending(), [W1], 'a new budget queues a publication');
  await db.exec(`update public.workspace_budgets set limit_nanos = 200 where id = '${B1}'`);
  assert.deepEqual(await pending(), [W1], 'a budget change queues a publication');
  await db.exec(`delete from public.workspace_budgets where id = '${B1}'`);
  assert.deepEqual(await pending(), [W1], 'a removed budget queues a publication');

  await db.exec(`delete from public.workspaces where id = '${W1}'`);
  assert.deepEqual(await pending(), [], 'deleting a workspace cascades without queueing for it');
  assert.equal((await rows(`select count(*)::int as n from public.keys where workspace_id = '${W1}'`))[0].n, 0, 'its keys are gone');

  console.log('gateway-key-cache-publication: ok');
} finally {
  await db.close();
}
