import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const migration = await read('../migrations/20261022122000_public_catalogue_revision.sql');

// The schema files must match what the migration applies.
for (const file of [
  '../schemas/private/tables/public_catalogue_revision.sql',
  '../schemas/private/functions/bump_public_catalogue_revision.sql',
  '../schemas/public/functions/get_public_catalogue_purge_state.sql',
  '../schemas/public/functions/mark_public_catalogue_purged.sql',
]) {
  assert.ok(migration.includes((await read(file)).replace(/\r\n/g, '\n').trim()), `${file} differs from the migration`);
}

const db = new PGlite();
await db.exec(`
  create schema private;
  create role service_role; create role anon; create role authenticated;
  create table public.v2_models (model_slug text primary key, name text, updated_at timestamptz not null default now());
  create table public.v2_model_provider_routes (provider_model_id text primary key, model_slug text, updated_at timestamptz not null default now());
  create table public.v2_benchmark_results (result_id text primary key, model_slug text, score numeric, updated_at timestamptz not null default now());
  create table public.v2_lab_links (id int primary key);
  create table public.v2_labs (lab_slug text primary key);
  create table public.v2_benchmarks (benchmark_id text primary key);
  create table public.v2_model_aliases (alias_slug text primary key);
  create table public.v2_model_details (id int primary key);
  create table public.v2_model_families (family_slug text primary key);
  create table public.v2_model_links (id int primary key);
  create table public.v2_model_page_notices (id int primary key);
  create table public.v2_pricing_sku_meters (id int primary key);
  create table public.v2_pricing_skus (id int primary key);
  create table public.v2_provider_regions (id int primary key);
  create table public.v2_providers (provider_slug text primary key);
  create table public.v2_route_capabilities (id int primary key);
  create table public.v2_route_parameter_support (id int primary key);
  create table public.v2_route_variants (id int primary key);
  create table public.v2_service_tiers (id int primary key);
  create table public.v2_subscription_plan_models (id int primary key);
  create table public.v2_subscription_plans (id int primary key);
`);
await db.exec(migration.replace(/^SET local check_function_bodies = off;/m, ''));

const state = async () => (await db.query('select * from public.get_public_catalogue_purge_state()')).rows[0];
const revision = async () => Number((await state()).revision);

assert.equal(await revision(), 0);

await db.exec(`insert into v2_models (model_slug, name) values ('lab/new-model', 'New model')`);
assert.equal(await revision(), 1, 'adding a model bumps the revision');

await db.exec(`update v2_models set name = name`);
assert.equal(await revision(), 1, 'an identical rewrite does not bump');

await db.exec(`update v2_models set updated_at = now() + interval '1 minute'`);
assert.equal(await revision(), 1, 'an updated_at-only rewrite does not bump');

await db.exec(`update v2_models set name = 'Renamed'`);
assert.equal(await revision(), 2, 'a visible change bumps');

await db.exec(`
  begin;
  insert into v2_benchmark_results select 'r' || i, 'lab/new-model', i from generate_series(1, 500) i;
  insert into v2_model_provider_routes values ('route-a', 'lab/new-model');
  update v2_models set name = 'Renamed again';
  commit;
`);
assert.equal(await revision(), 3, 'a transaction touching many rows and tables bumps once');

await db.exec(`update v2_benchmark_results set score = score where result_id = 'missing'`);
assert.equal(await revision(), 3, 'a statement that matches no rows does not bump');

await db.exec(`delete from v2_model_provider_routes where provider_model_id = 'route-a'`);
assert.equal(await revision(), 4, 'a delete bumps');

const before = await state();
assert.equal(Number(before.purged_revision), 0);
assert.ok(before.pending_since, 'a pending change records when it started');
await db.query('select public.mark_public_catalogue_purged($1)', [3]);
assert.equal(Number((await state()).purged_revision), 3);
assert.ok((await state()).pending_since, 'a purge behind the latest revision keeps the change pending');
await db.query('select public.mark_public_catalogue_purged($1)', [4]);
assert.equal(Number((await state()).purged_revision), 4);
assert.equal((await state()).pending_since, null, 'a purge up to the latest revision clears the pending start');
await db.query('select public.mark_public_catalogue_purged($1)', [2]);
assert.equal(Number((await state()).purged_revision), 4, 'an older purge never moves the marker back');

const triggers = (await db.query(`select count(*)::int as n from pg_trigger where tgname = 'public_catalogue_changed'`)).rows[0].n;
assert.equal(triggers, 21);

console.log('public catalogue revision: ok');
