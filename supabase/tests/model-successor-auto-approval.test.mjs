import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const admin = '10000000-0000-4000-8000-000000000001';
const value = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const refresh = () => value('select public.refresh_model_unserved_since() as value');
const state = slug => value('select public.get_model_successor_routing($1) as value', [slug]);
const setRouting = (slug, enabled, allow = false) =>
  value('select public.set_model_successor_routing($1,$2,$3,$4) as value', [admin, slug, enabled, allow]);
const approvedTo = async slug => {
  const current = await state(slug);
  return current.approval_current ? current.approved_successor_slug : null;
};

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create schema cron; create table cron.jobs(name text, schedule text, command text);
    create function cron.schedule(text, text, text) returns bigint language sql as $$ insert into cron.jobs values ($1,$2,$3); select 1::bigint $$;
    create table public.users(user_id uuid primary key, role text);
    create table public.v2_models(model_slug text primary key, status text not null default 'active', hidden boolean not null default false,
      input_modalities text[] not null default '{text}', output_modalities text[] not null default '{text}', variant_kind text not null default 'standard',
      replacement_model_slug text, deprecated_at timestamptz, retired_at timestamptz);
    create table public.v2_providers(provider_slug text primary key, status text not null default 'active', routing_enabled boolean not null default true);
    create table public.v2_model_provider_routes(provider_model_id text primary key, model_slug text not null, provider_slug text not null,
      routing_enabled boolean not null default true, context_length integer, metadata jsonb not null default '{}',
      effective_from timestamptz, effective_to timestamptz);
    create table public.v2_route_capabilities(provider_model_id text, capability_id text, status text not null default 'active',
      effective_from timestamptz, effective_to timestamptz);
  `);
  await db.exec(await read('../schemas/public/tables/v2_catalogue_admin_changes.sql'));
  await db.exec(await read('../migrations/20261015111100_model_successor_routing_approval.sql'));

  // An approval made before this change is labelled as an admin approval.
  await db.exec(`
    insert into auth.users values ('${admin}');
    insert into public.users values ('${admin}', 'admin');
    insert into public.v2_providers values ('host');
    insert into public.v2_models(model_slug, status, replacement_model_slug, input_modalities, variant_kind, retired_at) values
      ('lab/new', 'active', null, '{text,image}', 'standard', null),
      ('lab/long', 'retired', 'lab/new', '{text}', 'standard', now() - interval '1 day'),
      ('lab/painter', 'retired', 'lab/new', '{text}', 'standard', now() - interval '1 day'),
      ('lab/new-text', 'active', null, '{text}', 'standard', null),
      ('lab/unserved', 'active', null, '{text,image}', 'standard', null),
      ('lab/earlier', 'retired', 'lab/new', '{text}', 'standard', now() - interval '30 days'),
      ('lab/old', 'deprecated', 'lab/new', '{text}', 'standard', now() + interval '30 days'),
      ('lab/vision', 'retired', 'lab/new-text', '{text,image}', 'standard', now() - interval '1 day'),
      ('lab/dead-end', 'retired', 'lab/unserved', '{text}', 'standard', now() - interval '1 day'),
      ('lab/old:free', 'retired', 'lab/new', '{text}', 'free', now() - interval '1 day'),
      ('lab/hidden-old', 'retired', 'lab/new', '{text}', 'standard', now() - interval '1 day'),
      ('lab/current', 'active', 'lab/new', '{text}', 'standard', null);
    update public.v2_models set hidden=true where model_slug='lab/hidden-old';
    update public.v2_models set output_modalities='{image}' where model_slug='lab/painter';
    insert into public.v2_model_provider_routes(provider_model_id, model_slug, provider_slug, context_length) values
      ('new-host', 'lab/new', 'host', 200000), ('new-text-host', 'lab/new-text', 'host', 200000),
      ('old-host', 'lab/old', 'host', 128000), ('vision-host', 'lab/vision', 'host', 128000),
      ('earlier-host', 'lab/earlier', 'host', 128000), ('dead-end-host', 'lab/dead-end', 'host', 128000),
      ('long-host', 'lab/long', 'host', 400000);
    insert into public.v2_route_capabilities(provider_model_id, capability_id) values
      ('new-host', 'text.generate'), ('new-text-host', 'text.generate'), ('old-host', 'text.generate'),
      ('vision-host', 'text.generate'), ('earlier-host', 'text.generate'), ('dead-end-host', 'text.generate');
  `);
  await value(`select public.set_model_successor_routing('${admin}', 'lab/earlier', true) as value`);
  await db.exec(await read('../migrations/20261021105000_auto_approve_model_successors.sql'));
  assert.equal(await value(`select approval_source as value from public.v2_model_successor_routing where model_slug='lab/earlier'`), 'admin');

  // Replacements of deprecated or retired visible models are approved, with a
  // smaller context or a missing input type accepted as warnings.
  let run = await refresh();
  assert.equal(run.auto_approved, 3);
  let current = await state('lab/old');
  assert.deepEqual([current.approval_current, current.approved_successor_slug, current.approval_source, current.approved_by],
    [true, 'lab/new', 'auto', null]);
  assert.equal(current.approved_compatibility.accepted_warnings, false);
  current = await state('lab/vision');
  assert.deepEqual([current.approved_successor_slug, current.approval_source, current.approved_compatibility.accepted_warnings],
    ['lab/new-text', 'auto', true]);
  assert.deepEqual((await state('lab/long')).approved_compatibility.warnings, ['smaller_context']);
  assert.equal(await approvedTo('lab/painter'), null, 'a missing output type needs an admin');
  assert.equal(await approvedTo('lab/dead-end'), null, 'an unserved replacement needs an admin');
  assert.equal(await approvedTo('lab/old:free'), null, 'free to paid is never approved');
  assert.equal(await approvedTo('lab/hidden-old'), null, 'hidden models are skipped');
  assert.equal(await approvedTo('lab/current'), null, 'models without a lifecycle date are skipped');
  assert.equal(await approvedTo('lab/earlier'), 'lab/new', 'admin approvals are kept');

  // The approval is audited without an actor, and a second run changes nothing.
  const audit = (await db.query(`select actor_user_id, after_state from public.v2_catalogue_admin_changes where resource_id='lab/old'`)).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor_user_id, null);
  assert.equal(audit[0].after_state.successor_routing.approval_source, 'auto');
  assert.equal((await refresh()).auto_approved, 0);

  // A deprecation date alone is enough to count as a lifecycle model.
  await db.exec(`update public.v2_models set deprecated_at=now() where model_slug='lab/current'`);
  assert.equal((await refresh()).auto_approved, 1);
  assert.equal(await approvedTo('lab/current'), 'lab/new');

  // A changed replacement is approved again when it is also clean.
  await db.exec(`update public.v2_models set replacement_model_slug='lab/new-text' where model_slug='lab/old'`);
  assert.equal((await refresh()).auto_approved, 1);
  assert.equal(await approvedTo('lab/old'), 'lab/new-text');

  // Revoking stops the job from approving the model again.
  current = await setRouting('lab/old', false);
  assert.deepEqual([current.auto_route_enabled, current.auto_approval_blocked, current.approval_source], [false, true, null]);
  assert.equal((await refresh()).auto_approved, 0);
  assert.equal(await approvedTo('lab/old'), null);

  // Blocking a model before the job ever approved it works too.
  await db.exec(`update public.v2_models set replacement_model_slug='lab/new' where model_slug='lab/dead-end'`);
  current = await setRouting('lab/dead-end', false);
  assert.equal(current.auto_approval_blocked, true);
  assert.equal((await refresh()).auto_approved, 0);

  // Approving by hand lifts the block and is recorded as an admin approval.
  current = await setRouting('lab/old', true);
  assert.deepEqual([current.approval_current, current.auto_approval_blocked, current.approval_source], [true, false, 'admin']);
  current = await setRouting('lab/vision', true, true);
  assert.deepEqual([current.approved_successor_slug, current.approval_source, current.approved_compatibility.accepted_warnings],
    ['lab/new-text', 'admin', true]);

  // Approved routing still only follows a model that has stopped being served.
  await db.exec(`update public.v2_model_provider_routes set routing_enabled=false where provider_model_id='old-host'`);
  run = await refresh();
  assert.deepEqual([run.marked, run.auto_approved], [1, 0]);
  console.log('model successor auto-approval');
} finally {
  await db.close();
}
