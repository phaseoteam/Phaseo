// Standalone PostgreSQL regression test for public.apply_guardrail_assignment_change, which adds and
// removes guardrails on many keys or members in one transaction for the settings Assignments tab.
// Checks: only the requested pairs change, a failure part-way leaves everything as it was, guardrails
// and keys from another workspace are refused, a former member's rows can be removed, and only the
// service role can call it.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/apply-guardrail-assignment-change.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort();
const migrationName = migrations.find((name) => name.endsWith('_apply_guardrail_assignment_change.sql'));
assert(migrationName, 'the migration exists');
let newest = migrationName;
for (const name of migrations.filter((name) => name > migrationName)) {
  if ((await read(`../migrations/${name}`)).includes('FUNCTION public.apply_guardrail_assignment_change')) newest = name;
}
const migration = await read(`../migrations/${newest}`);
const schemaFile = 'public/functions/apply_guardrail_assignment_change.sql';
assert(normalize(migration).includes(normalize(await read(`../schemas/${schemaFile}`))), `${schemaFile} is in ${newest}`);
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const list of ['loadOrder', 'files']) assert(manifest[list].includes(schemaFile), `${schemaFile} is in the manifest's ${list}`);
assert.match(await read('../../.github/workflows/declarative-schema.yml'), /node supabase\/tests\/apply-guardrail-assignment-change\.test\.mjs/, 'CI runs this suite');

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const W1 = id(1);
const W2 = id(2);
const [G1, G2, GFOREIGN] = [id(11), id(12), id(13)];
const [K1, K2, K3, KFOREIGN] = [id(21), id(22), id(23), id(24)];
const [U1, U2, ULEFT] = [id(31), id(32), id(33)];

const db = new PGlite();
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const apply = (workspaceId, targetType, targetIds, add, remove) => db.query(
  'select public.apply_guardrail_assignment_change($1::uuid, $2, $3::uuid[], $4::uuid[], $5::uuid[])',
  [workspaceId, targetType, targetIds, add, remove],
);
const keyPairs = async () => (await rows('select key_id, guardrail_id from public.key_guardrails order by 1, 2')).map((row) => `${row.key_id.slice(-2)}:${row.guardrail_id.slice(-2)}`);
const memberPairs = async () => (await rows('select workspace_id, user_id, guardrail_id from public.workspace_member_guardrails order by 1, 2, 3'))
  .map((row) => `${row.workspace_id.slice(-2)}:${row.user_id.slice(-2)}:${row.guardrail_id.slice(-2)}`);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.workspaces (id uuid primary key);
    create table public.users (user_id uuid primary key);
    create table public.keys (id uuid primary key, workspace_id uuid not null references public.workspaces(id));
    create table public.workspace_guardrails (id uuid primary key, workspace_id uuid not null references public.workspaces(id));
    create table public.key_guardrails (
      key_id uuid not null references public.keys(id) on delete cascade,
      guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade,
      primary key (key_id, guardrail_id));
    create table public.workspace_member_guardrails (
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      user_id uuid not null references public.users(user_id) on delete cascade,
      guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade,
      primary key (workspace_id, user_id, guardrail_id));
  `);
  await db.exec(migration);
  await db.exec(`
    insert into public.workspaces values ('${W1}'), ('${W2}');
    insert into public.users values ('${U1}'), ('${U2}'), ('${ULEFT}');
    insert into public.keys values ('${K1}', '${W1}'), ('${K2}', '${W1}'), ('${K3}', '${W1}'), ('${KFOREIGN}', '${W2}');
    insert into public.workspace_guardrails values ('${G1}', '${W1}'), ('${G2}', '${W1}'), ('${GFOREIGN}', '${W2}');
    insert into public.key_guardrails values ('${K1}', '${G2}'), ('${K2}', '${G1}'), ('${K3}', '${G2}');
    insert into public.workspace_member_guardrails values ('${W1}', '${U1}', '${G2}'), ('${W1}', '${ULEFT}', '${G1}'), ('${W2}', '${U1}', '${G2}');
  `);

  // ---- Only the requested pairs change; an existing pair is not duplicated.
  await apply(W1, 'key', [K1, K2], [G1], [G2]);
  assert.deepEqual(await keyPairs(), ['21:11', '22:11', '23:12'], 'k1 loses g2 and gains g1, k2 keeps g1 once, k3 is untouched');
  await apply(W1, 'member', [U1, U2], [G1], [G2]);
  assert.deepEqual(await memberPairs(), ['01:31:11', '01:32:11', '01:33:11', '02:31:12'], 'members in this workspace only');

  // ---- A former member's row can be removed (no membership check in the function).
  await apply(W1, 'member', [ULEFT], [], [G1]);
  assert.deepEqual(await memberPairs(), ['01:31:11', '01:32:11', '02:31:12'], "the former member's guardrail is gone");

  // ---- A failure part-way leaves every assignment as it was.
  await db.exec(`
    create function public.fail_on_g2() returns trigger language plpgsql as $$
    begin if new.guardrail_id = '${G2}' then raise exception 'simulated failure'; end if; return new; end $$;
    create trigger fail_on_g2 before insert on public.key_guardrails for each row execute function public.fail_on_g2();
  `);
  const before = await keyPairs();
  await assert.rejects(apply(W1, 'key', [K1, K2, K3], [G2], [G1]), /simulated failure/);
  assert.deepEqual(await keyPairs(), before, 'the removals are rolled back with the failed additions');
  await db.exec('drop trigger fail_on_g2 on public.key_guardrails');

  // ---- Another workspace's guardrails and keys are refused, and nothing changes.
  await assert.rejects(apply(W1, 'key', [K1], [GFOREIGN], []), /guardrail_not_found/);
  await assert.rejects(apply(W1, 'member', [U1], [], [GFOREIGN]), /guardrail_not_found/);
  await assert.rejects(apply(W1, 'key', [K1, KFOREIGN], [G2], []), /guardrail_assignment_target_not_found/);
  await assert.rejects(apply(W1, 'team', [K1], [G2], []), /invalid_guardrail_assignment_target/);
  assert.deepEqual(await keyPairs(), before, 'refused changes write nothing');

  // ---- Service role only.
  const grants = await rows(`select has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') authenticated,
      has_function_privilege('service_role', p.oid, 'execute') service
    from pg_proc p where p.proname = 'apply_guardrail_assignment_change'`);
  assert.deepEqual(grants, [{ anon: false, authenticated: false, service: true }]);
  console.log('apply_guardrail_assignment_change: ok');
} finally {
  await db.close();
}
