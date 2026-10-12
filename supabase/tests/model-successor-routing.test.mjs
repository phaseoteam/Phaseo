import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const admin = '10000000-0000-4000-8000-000000000001';
const member = '10000000-0000-4000-8000-000000000002';
const value = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const refresh = () => value('select public.refresh_model_unserved_since() as value');
const unservedSince = slug => value('select unserved_since as value from public.v2_model_successor_routing where model_slug=$1', [slug]);
const state = slug => value('select public.get_model_successor_routing($1) as value', [slug]);
const approve = (slug, allow = false) => value('select public.set_model_successor_routing($1,$2,true,$3,$4) as value', [admin, slug, allow, 'reviewed']);
const rejects = async (promise, pattern) => assert.match((await promise.then(() => null, error => error)).message, pattern);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create schema cron; create table cron.jobs(name text, schedule text, command text);
    create function cron.schedule(text, text, text) returns bigint language sql as $$ insert into cron.jobs values ($1,$2,$3); select 1::bigint $$;
    create table public.users(user_id uuid primary key, role text);
    create table public.v2_models(model_slug text primary key, status text not null default 'active', hidden boolean not null default false,
      input_modalities text[] not null default '{}', output_modalities text[] not null default '{}', variant_kind text not null default 'standard',
      replacement_model_slug text);
    create table public.v2_providers(provider_slug text primary key, status text not null default 'active');
    create table public.v2_model_provider_routes(provider_model_id text primary key, model_slug text not null, provider_slug text not null,
      routing_enabled boolean not null default true, context_length integer, metadata jsonb not null default '{}',
      effective_from timestamptz, effective_to timestamptz);
    create table public.v2_route_capabilities(provider_model_id text, capability_id text, status text not null default 'active',
      effective_from timestamptz, effective_to timestamptz);
  `);
  await db.exec(await read('../schemas/public/tables/v2_catalogue_admin_changes.sql'));
  await db.exec(await read('../migrations/20261012213500_model_successor_routing_approval.sql'));
  assert.equal(await value(`select command as value from cron.jobs where name='track-model-unserved-since'`),
    `set statement_timeout = '60s'; set lock_timeout = '5s'; select public.refresh_model_unserved_since();`);

  await db.exec(`
    insert into auth.users values ('${admin}'), ('${member}');
    insert into public.users values ('${admin}', 'admin'), ('${member}', 'user');
    insert into public.v2_providers values ('host', 'active'), ('feed', 'external');
    insert into public.v2_models(model_slug, status, input_modalities, output_modalities, replacement_model_slug, variant_kind) values
      ('lab/old', 'deprecated', array['text','image'], array['text'], 'lab/new', 'standard'),
      ('lab/new', 'active', array['text','image'], array['text'], null, 'standard'),
      ('lab/text-only', 'active', array['text'], array['text'], null, 'standard'),
      ('lab/old:free', 'retired', array['text'], array['text'], 'lab/new', 'free'),
      ('lab/catalogue-only', 'active', array['text'], array['text'], null, 'standard');
    insert into public.v2_model_provider_routes(provider_model_id, model_slug, provider_slug, context_length) values
      ('old-host', 'lab/old', 'host', 128000), ('old-feed', 'lab/old', 'feed', 128000),
      ('new-host', 'lab/new', 'host', 200000), ('text-host', 'lab/text-only', 'host', 64000),
      ('free-host', 'lab/old:free', 'host', 32000);
    insert into public.v2_route_capabilities(provider_model_id, capability_id) values
      ('old-host', 'text.generate'), ('old-feed', 'text.generate'), ('new-host', 'text.generate'),
      ('text-host', 'text.generate'), ('free-host', 'text.generate');
  `);

  // Backend-only: signed-in users cannot read approvals or call the RPCs.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await rejects(db.query('select * from public.v2_model_successor_routing'), /permission denied/);
    await rejects(db.query('select public.refresh_model_unserved_since()'), /permission denied/);
    await rejects(db.query(`select public.set_model_successor_routing('${admin}', 'lab/old', true)`), /permission denied/);
    await db.exec('reset role');
  }

  // Served models are not stamped; models with no routes at all are never tracked.
  const first = await refresh();
  assert.deepEqual([first.marked, first.cleared], [0, 0]);
  assert.equal((await db.query('select 1 from public.v2_model_successor_routing')).rows.length, 0);

  // Only an external feed route left (no override) means unserved; the stamp then holds.
  await db.exec(`update public.v2_model_provider_routes set routing_enabled=false where provider_model_id='old-host'`);
  assert.equal((await refresh()).marked, 1);
  const stamped = await unservedSince('lab/old');
  assert.ok(stamped instanceof Date);
  assert.equal((await refresh()).marked, 0);
  assert.equal((await unservedSince('lab/old')).getTime(), stamped.getTime());

  // An expired capability window does not count as served; an override on the feed route does.
  await db.exec(`update public.v2_model_provider_routes set metadata='{"external_routing_override":"true"}' where provider_model_id='old-feed'`);
  assert.deepEqual([(await refresh()).cleared, await unservedSince('lab/old')], [1, null]);
  await db.exec(`update public.v2_route_capabilities set effective_to=now() - interval '1 minute' where provider_model_id='old-feed'`);
  assert.equal((await refresh()).marked, 1);

  // Hidden models stop being tracked.
  await db.exec(`update public.v2_models set hidden=true where model_slug='lab/old'`);
  assert.deepEqual([(await refresh()).cleared, await unservedSince('lab/old')], [1, null]);
  await db.exec(`update public.v2_models set hidden=false where model_slug='lab/old'`);
  await refresh();

  // Approval: admins only, warnings need an explicit override, free to paid never.
  await rejects(db.query(`select public.set_model_successor_routing('${member}', 'lab/old', true)`), /admin role/);
  let current = await state('lab/old');
  assert.deepEqual([current.compatibility.blocking, current.compatibility.warnings, current.approval_current], [[], [], false]);
  await rejects(approve('lab/old:free'), /cannot be approved: free_to_paid/);

  await db.exec(`update public.v2_models set replacement_model_slug='lab/text-only' where model_slug='lab/old'`);
  current = await state('lab/old');
  assert.deepEqual(current.compatibility.warnings, ['missing_input_modalities', 'smaller_context']);
  assert.deepEqual(current.compatibility.missing_input_modalities, ['image']);
  await rejects(approve('lab/old'), /compatibility warnings: missing_input_modalities, smaller_context/);
  current = await approve('lab/old', true);
  assert.deepEqual([current.auto_route_enabled, current.approved_successor_slug, current.approval_current, current.notes],
    [true, 'lab/text-only', true, 'reviewed']);
  assert.equal(current.approved_compatibility.accepted_warnings, true);
  assert.ok(current.unserved_since, 'approval keeps the unserved stamp');

  // Changing the successor voids the approval until it is reviewed again.
  await db.exec(`update public.v2_models set replacement_model_slug='lab/new' where model_slug='lab/old'`);
  current = await state('lab/old');
  assert.deepEqual([current.auto_route_enabled, current.approval_current], [true, false]);
  current = await approve('lab/old');
  assert.deepEqual([current.approved_successor_slug, current.approval_current, current.approved_compatibility.accepted_warnings], ['lab/new', true, false]);

  // Revoking clears the approval and both changes are audited.
  current = await value(`select public.set_model_successor_routing('${admin}', 'lab/old', false) as value`);
  assert.deepEqual([current.auto_route_enabled, current.approved_successor_slug, current.approval_current], [false, null, false]);
  const audits = (await db.query(`select after_state from public.v2_catalogue_admin_changes where resource_id='lab/old' order by created_at`)).rows;
  assert.equal(audits.length, 3);
  assert.equal(audits[2].after_state.successor_routing.auto_route_enabled, false);
  // A no-op revoke writes no audit row.
  await value(`select public.set_model_successor_routing('${admin}', 'lab/old', false) as value`);
  assert.equal(await value(`select count(*)::int as value from public.v2_catalogue_admin_changes`), 3);
  console.log('model successor routing approval and unserved tracking');
} finally {
  await db.close();
}
