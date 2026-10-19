import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const ws = (n) => `10000000-0000-4000-8000-00000000000${n}`;
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
const DIMENSIONS = JSON.stringify([{ key: 'department', values: [{ value: 'legal' }, { value: 'sales' }] }]);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create schema private;
    create table auth.users (id uuid primary key);
    create table public.oauth_clients (id text primary key, allowed_scopes text[], updated_at timestamptz);
    create table public.workspaces (id uuid primary key);
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$ begin return NEW; end $$;
    create function private.capture_gateway_workspace_publication() returns trigger language plpgsql security definer as $$ begin return null; end $$;
    insert into public.workspaces values ('${ws(1)}'), ('${ws(2)}');
  `);
  await db.exec(await migration('20261019155013_workspace_request_classifiers.sql'));
  const spendMigration = await migration('20261019161226_request_classifier_spend.sql');
  await db.exec(spendMigration);
  assert.ok(spendMigration.includes(await schema('public/tables/workspace_request_classifier_spend_monthly.sql')), 'table matches the declarative definition');
  assert.ok(spendMigration.includes(await schema('public/functions/record_request_classifier_spend.sql')), 'function matches the declarative definition');

  const [{ id: classifier }] = await rows(
    `insert into public.workspace_request_classifiers (workspace_id, name, model, dimensions) values ($1, 'Department', 'm', $2) returning id`,
    [ws(1), DIMENSIONS],
  );

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows('select * from public.workspace_request_classifier_spend_monthly'), /permission denied/);
    await assert.rejects(rows(`select public.record_request_classifier_spend('${ws(1)}', '${classifier}', 1)`), /permission denied/);
    await db.exec('reset role');
  }

  await db.exec('set role service_role');
  await assert.rejects(rows(`insert into public.workspace_request_classifier_spend_monthly (classifier_id, workspace_id, month) values ('${classifier}', '${ws(1)}', '2026-10-01')`), /permission denied/, 'writes only go through the function');
  const record = (workspace, cost) => rows('select public.record_request_classifier_spend($1, $2, $3)', [workspace, classifier, cost]);
  await record(ws(1), 25000);
  await record(ws(1), 15000);
  await record(ws(1), -5);
  await record(ws(1), null);
  await record(ws(2), 99999);
  const spend = await rows('select workspace_id, month, classifications, cost_nanos from public.workspace_request_classifier_spend_monthly');
  const [{ month }] = await rows(`select date_trunc('month', now() at time zone 'utc')::date as month`);
  assert.deepEqual(spend, [{ workspace_id: ws(1), month, classifications: 4, cost_nanos: 40000 }], 'adds per month, clamps negatives, ignores a mismatched workspace');

  await db.exec('reset role');
  await assert.rejects(rows(`insert into public.workspace_request_classifier_spend_monthly (classifier_id, workspace_id, month) values ('${classifier}', '${ws(1)}', '2026-10-15')`), /month_check/);
  await db.exec(`delete from public.workspace_request_classifiers where id = '${classifier}'`);
  assert.equal((await rows('select 1 from public.workspace_request_classifier_spend_monthly')).length, 0, 'deleting a classifier removes its spend');

  console.log('request classifier spend tests passed');
} finally {
  await db.close();
}
