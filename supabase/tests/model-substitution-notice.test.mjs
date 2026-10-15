import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const rejects = async (promise, pattern) => assert.match((await promise.then(() => null, error => error)).message, pattern);
const workspace = '20000000-0000-4000-8000-000000000001';
const record = async (model, successor, source = 'approved', ws = workspace) =>
  (await db.query('select public.record_model_substitution($1, $2, $3, $4) as value', [ws, model, successor, source])).rows[0].value;

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth; create table auth.users(id uuid primary key, email text);
    insert into auth.users values ('10000000-0000-4000-8000-000000000001', ' owner@example.com '), ('10000000-0000-4000-8000-000000000002', null);
    create table public.workspaces(id uuid primary key, name text, owner_user_id uuid);
    insert into public.workspaces values
      ('${workspace}', 'Acme', '10000000-0000-4000-8000-000000000001'),
      ('20000000-0000-4000-8000-000000000002', 'No email', '10000000-0000-4000-8000-000000000002');
    create table public.v2_models(model_slug text primary key, name text);
    insert into public.v2_models values ('lab/old', 'Old Model'), ('lab/new', 'New Model'), ('lab/other', null),
      ('lab/a:lab/b', null), ('lab/c', null), ('lab/a', null), ('lab/b:lab/c', null);
    create table public.email_outbox(id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
      kind text not null, template text not null default 'generic', to_email text not null, subject text, workspace_id uuid, user_id uuid,
      payload jsonb not null default '{}', attempts integer not null default 0, last_error text, sent_at timestamptz, dedupe_key text);
    create unique index email_outbox_dedupe_key_unique on public.email_outbox(dedupe_key);
    create table public.notification_destinations(id uuid primary key, workspace_id uuid, status text not null default 'active');
    create table public.notification_event_destinations(workspace_id uuid not null, event_kind text not null, destination_id uuid not null,
      constraint notification_event_destinations_event_kind_check
        check (event_kind = any (array['low_balance', 'auto_top_up_failed', 'payment_method_expiring', 'model_deprecation'])),
      primary key (workspace_id, event_kind, destination_id));
    insert into public.notification_destinations values ('30000000-0000-4000-8000-000000000001', '${workspace}', 'active');
  `);
  await db.exec(await read('../migrations/20261015111400_model_substitution_notice.sql'));

  // Backend-only.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await rejects(db.query(`select public.record_model_substitution('${workspace}', 'lab/old', 'lab/new', 'approved')`), /permission denied/);
    await db.exec('reset role');
  }

  // The first substitution queues one notice for the owner; later calls do nothing.
  assert.equal(await record('lab/old', 'lab/new'), true);
  assert.equal(await record('lab/old', 'lab/new', 'workspace'), false);
  const rows = (await db.query(`select kind, template, to_email, subject, user_id, dedupe_key, payload from public.email_outbox`)).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    kind: 'model_substitution',
    template: 'model_substitution',
    to_email: 'owner@example.com',
    subject: 'Model replaced: Old Model',
    user_id: '10000000-0000-4000-8000-000000000001',
    dedupe_key: `model_substitution:${workspace}:${createHash('md5').update('7:lab/oldlab/new').digest('hex')}`,
    payload: {
      title: 'Model replaced: Old Model',
      workspace_name: 'Acme',
      model_id: 'lab/old',
      model_name: 'Old Model',
      replacement_model_id: 'lab/new',
      replacement_model_name: 'New Model',
      source: 'approved',
    },
  });

  // A different replacement for the same model is a new notice; names fall back to slugs.
  assert.equal(await record('lab/old', 'lab/other', 'workspace'), true);
  assert.equal((await db.query(`select payload->>'replacement_model_name' as name from public.email_outbox where payload->>'replacement_model_id' = 'lab/other'`)).rows[0].name, 'lab/other');

  // Slugs containing ':' cannot collide with another pair.
  assert.equal(await record('lab/a:lab/b', 'lab/c'), true);
  assert.equal(await record('lab/a', 'lab/b:lab/c'), true);
  await db.exec(`delete from public.email_outbox where payload->>'model_id' in ('lab/a:lab/b', 'lab/a')`);

  // Unknown models, or an owner without an email, queue nothing.
  assert.equal(await record('lab/missing', 'lab/new'), false);
  assert.equal(await record('lab/old', 'lab/new', 'approved', '20000000-0000-4000-8000-000000000002'), false);
  assert.equal((await db.query('select count(*)::int as n from public.email_outbox')).rows[0].n, 2);

  // Bad input is rejected.
  await rejects(record('lab/new', 'lab/new'), /invalid_model_substitution/);
  await rejects(record('lab/new', 'lab/old', 'admin'), /invalid_model_substitution/);

  // Workspaces can route the new kind to their destinations.
  await db.exec(`select public.set_notification_event_destinations('${workspace}', 'model_substitution', array['30000000-0000-4000-8000-000000000001']::uuid[])`);
  assert.equal((await db.query(`select count(*)::int as n from public.notification_event_destinations where event_kind = 'model_substitution'`)).rows[0].n, 1);
  await rejects(db.query(`select public.set_notification_event_destinations('${workspace}', 'model_unknown', array[]::uuid[])`), /invalid_notification_event_kind/);

  console.log('model substitution notice tests passed');
} finally {
  await db.close();
}
