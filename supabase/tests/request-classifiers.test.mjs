import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-00000000000${n}`;
const ws = (n) => id('1', n);
const user = (n) => id('2', n);
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const migrationUrl = new URL('../migrations/20261019155013_workspace_request_classifiers.sql', import.meta.url);
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
const DIMENSIONS = JSON.stringify([{ key: 'department', name: 'Department', multiple: false, allow_other: true, values: [{ value: 'legal' }] }]);

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create schema private;
    create table auth.users (id uuid primary key);
    create table public.oauth_clients (id text primary key, allowed_scopes text[], updated_at timestamptz);
    create table public.workspaces (id uuid primary key);
    grant select on public.workspaces to service_role;
    create function public.set_updated_at_if_changed() returns trigger language plpgsql as $$
    begin
      if row(NEW.*) is distinct from row(OLD.*) and NEW.updated_at is not distinct from OLD.updated_at then
        NEW.updated_at := now();
      end if;
      return NEW;
    end $$;
    -- Records which workspaces the gateway publication trigger would republish.
    create table private.published (workspace_id uuid, op text);
    create function private.capture_gateway_workspace_publication() returns trigger language plpgsql security definer as $$
    begin
      insert into private.published values (coalesce(NEW.workspace_id, OLD.workspace_id), tg_op);
      return null;
    end $$;
    insert into public.oauth_clients values ('phaseo_cli', array['keys:read'], null), ('other', array['keys:read'], null);
    insert into auth.users values ('${user(1)}');
    insert into public.workspaces values ('${ws(1)}'), ('${ws(2)}');
  `);
  const migration = await readFile(migrationUrl, 'utf8');
  await db.exec(migration);

  assert.ok(migration.includes(await schema('public/tables/workspace_request_classifiers.sql')), 'table migration matches the declarative definition');
  assert.ok(migration.includes(await schema('public/functions/enforce_request_classifier_limit.sql')), 'function migration matches the declarative definition');

  const [cli] = await rows(`select allowed_scopes from public.oauth_clients where id = 'phaseo_cli'`);
  assert.deepEqual(cli.allowed_scopes, ['classifiers:delete', 'classifiers:read', 'classifiers:write', 'keys:read']);
  const [other] = await rows(`select allowed_scopes from public.oauth_clients where id = 'other'`);
  assert.deepEqual(other.allowed_scopes, ['keys:read'], 'only the first-party CLI client gains the scopes');

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows('select * from public.workspace_request_classifiers'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');

  const insert = (workspace, name, extra = {}) => {
    const columns = { workspace_id: workspace, name, model: 'google/gemini-2.5-flash-lite', dimensions: DIMENSIONS, ...extra };
    const names = Object.keys(columns);
    return rows(
      `insert into public.workspace_request_classifiers (${names.join(', ')}) values (${names.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
      Object.values(columns),
    );
  };

  // Defaults classify every request's prompt, enabled, with no scope or budget.
  const [first] = await insert(ws(1), 'Department');
  assert.equal(first.enabled, true);
  assert.equal(first.sample_rate_bps, 10000);
  assert.equal(first.sample_by, 'request');
  assert.equal(first.input_scope, 'prompt');
  assert.deepEqual(first.scope, {});
  assert.equal(first.monthly_budget_nanos, null);

  // Constraints the API also validates, so direct writes cannot store a broken classifier.
  await assert.rejects(insert(ws(1), '  department '), /workspace_name_idx/, 'names are unique ignoring case and padding');
  await assert.rejects(insert(ws(1), '   '), /name_check/);
  await assert.rejects(insert(ws(1), 'No dims', { dimensions: '[]' }), /dimensions_check/);
  await assert.rejects(insert(ws(1), 'Obj dims', { dimensions: '{}' }), /dimensions_check/);
  await assert.rejects(insert(ws(1), 'Too many', { dimensions: JSON.stringify(Array.from({ length: 13 }, () => ({}))) }), /dimensions_check/);
  await assert.rejects(insert(ws(1), 'Zero rate', { sample_rate_bps: 0 }), /sample_rate_bps_check/);
  await assert.rejects(insert(ws(1), 'Over rate', { sample_rate_bps: 10001 }), /sample_rate_bps_check/);
  await assert.rejects(insert(ws(1), 'Sample', { sample_by: 'user' }), /sample_by_check/);
  await assert.rejects(insert(ws(1), 'Input', { input_scope: 'everything' }), /input_scope_check/);
  await assert.rejects(insert(ws(1), 'Scope', { scope: '[]' }), /scope_check/);
  await assert.rejects(insert(ws(1), 'Budget', { monthly_budget_nanos: 0 }), /monthly_budget_nanos_check/);
  await assert.rejects(insert(ws(1), 'Model', { model: ' ' }), /model_check/);

  // At most five per workspace; other workspaces are unaffected.
  for (const name of ['Audience', 'Task', 'Complexity', 'Compliance']) await insert(ws(1), name);
  await assert.rejects(insert(ws(1), 'Sixth'), /request_classifier_limit_reached/);
  await insert(ws(2), 'Department');
  await db.exec(`delete from public.workspace_request_classifiers where workspace_id = '${ws(1)}' and name = 'Task'`);
  await insert(ws(1), 'Replacement');
  await assert.rejects(
    rows(`update public.workspace_request_classifiers set workspace_id = '${ws(1)}' where workspace_id = '${ws(2)}'`),
    /request_classifier_limit_reached/,
    'moving a classifier into a full workspace is also capped',
  );

  // Every write republishes the workspace so the gateway reloads its classifiers.
  await db.exec('reset role');
  await db.exec('delete from private.published');
  await db.exec(`update public.workspace_request_classifiers set enabled = false where id = '${first.id}'`);
  await db.exec(`delete from public.workspace_request_classifiers where id = '${first.id}'`);
  const published = await rows('select workspace_id, op from private.published order by op desc');
  assert.deepEqual(published, [{ workspace_id: ws(1), op: 'UPDATE' }, { workspace_id: ws(1), op: 'DELETE' }]);

  // Updates bump updated_at; deleting the workspace removes its classifiers.
  const [second] = await rows(`select id from public.workspace_request_classifiers where workspace_id = '${ws(1)}' limit 1`);
  await db.exec(`update public.workspace_request_classifiers set updated_at = now() - interval '1 day' where id = '${second.id}'`);
  await db.exec(`update public.workspace_request_classifiers set sample_rate_bps = 500 where id = '${second.id}'`);
  const [{ fresh }] = await rows(`select updated_at > now() - interval '1 minute' as fresh from public.workspace_request_classifiers where id = '${second.id}'`);
  assert.equal(fresh, true);
  await db.exec(`delete from public.workspaces where id = '${ws(2)}'`);
  assert.equal((await rows(`select 1 from public.workspace_request_classifiers where workspace_id = '${ws(2)}'`)).length, 0);

  console.log('request classifier schema tests passed');
} finally {
  await db.close();
}
