// Standalone PostgreSQL regression test: a workspace can have at most 3 enabled data-contribution
// classifiers. The API's own count raced when two creates or enables arrived together, so the cap
// is a trigger that counts under a per-workspace advisory lock.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/workspace-classifier-limit.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const workspace = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const limitReached = /classifier_limit_reached/;

// The migration ships the declarative function and trigger, and the manifest lists the function.
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationName = migrations.find((name) => name.endsWith('_cap_enabled_workspace_classifiers.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));
// The lock plan: a lock timeout before any statement, and the trigger's table is the only table locked.
assert.match(migration.replace(/^--.*\n/gm, ''), /^SET LOCAL lock_timeout = '10s';/, 'the migration sets a lock timeout first');
const tableStatements = migration.replace(/--.*$/gm, '').replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '').split(';')
  .filter((statement) => /\b(alter\s+table|create\s+(unique\s+)?index|(create|drop)\s+(or\s+replace\s+)?trigger|(grant|revoke)\s[^;]*\bon\s+table)\b/i.test(statement));
assert.deepEqual(tableStatements.map((statement) => statement.match(/\bon\s+public\.(\w+)/i)?.[1]), ['workspace_classifiers'],
  'the trigger\'s table is the only one it locks');
const fnSql = normalize(await read('../schemas/public/functions/enforce_workspace_classifier_limit.sql'));
assert(migration.includes(fnSql), 'the migration ships the declarative function');
const tableSql = normalize(await read('../schemas/public/tables/workspace_classifiers.sql'));
const trigger = tableSql.slice(tableSql.indexOf('CREATE TRIGGER enforce_workspace_classifier_limit'), tableSql.indexOf('();', tableSql.indexOf('CREATE TRIGGER')) + 3);
assert(trigger.length > 40 && migration.includes(trigger), 'the migration ships the declarative trigger');
assert(/REVOKE ALL ON FUNCTION "public"\."enforce_workspace_classifier_limit"\(\) FROM PUBLIC, "anon", "authenticated";/.test(fnSql), 'only service_role can call it');
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const list of ['loadOrder', 'files']) {
  assert(manifest[list].includes('public/functions/enforce_workspace_classifier_limit.sql'), `listed in pgdelta ${list}`);
}

const db = new PGlite();
const insert = (slug, { owner = workspace, enabled = true } = {}) => db.query(
  `insert into public.workspace_classifiers(workspace_id, slug, name, instructions, categories, enabled)
   values($1, $2, $2, 'classify', '{}'::jsonb, $3) returning id`,
  [owner, slug, enabled],
);
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.workspaces(id uuid primary key);
  `);
  await db.exec(await read('../schemas/public/functions/enforce_workspace_classifier_limit.sql'));
  await db.exec(await read('../schemas/public/tables/workspace_classifiers.sql'));
  await db.query('insert into public.workspaces values($1),($2)', [workspace, other]);

  // Three enabled classifiers per workspace; a fourth is refused, a disabled one is not.
  await insert('phaseo-task-v1');
  await insert('intent');
  await insert('tone');
  await assert.rejects(insert('language'), limitReached);
  const paused = (await insert('language', { enabled: false })).rows[0].id;
  await insert('intent', { owner: other });

  // Enabling a fourth is refused; editing an enabled one or disabling is not.
  await assert.rejects(db.query('update public.workspace_classifiers set enabled = true where id = $1', [paused]), limitReached);
  await db.query(`update public.workspace_classifiers set name = 'Intent v2' where workspace_id = $1 and slug = 'intent'`, [workspace]);
  await db.query(`update public.workspace_classifiers set enabled = false where workspace_id = $1 and slug = 'tone'`, [workspace]);
  await db.query('update public.workspace_classifiers set enabled = true where id = $1', [paused]);

  // Re-running the starter upsert at the cap is not a new classifier.
  await db.query(`insert into public.workspace_classifiers(workspace_id, slug, name, instructions, categories)
    values($1, 'phaseo-task-v1', 'Task', 'classify', '{}'::jsonb) on conflict (workspace_id, slug) do nothing`, [workspace]);

  // The count runs under a per-workspace transaction lock, so a concurrent create or enable
  // waits for this one to commit and then sees its row.
  await db.exec('begin');
  await insert('summary', { owner: other });
  const locks = await db.query(`select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`);
  assert.equal(locks.rows[0].n, 1, 'the insert holds the workspace lock until commit');
  await db.exec('commit');

  const enabled = await db.query('select workspace_id, count(*)::int as n from public.workspace_classifiers where enabled group by 1 order by 1');
  assert.deepEqual(enabled.rows.map((row) => row.n), [3, 2]);
  console.log('workspace classifier limit: ok');
} finally {
  await db.close();
}
