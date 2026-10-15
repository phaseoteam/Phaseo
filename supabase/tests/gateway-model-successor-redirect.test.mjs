import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const resolve = async slug => (await db.query('select public.gateway_resolve_model_successor($1) as value', [slug])).rows[0].value;
const rejects = async (promise, pattern) => assert.match((await promise.then(() => null, error => error)).message, pattern);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create schema cron; create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
    create table public.users(user_id uuid primary key, role text);
    create table public.workspace_settings(workspace_id uuid primary key);
    insert into public.workspace_settings values ('20000000-0000-4000-8000-000000000001');
    create table public.v2_models(model_slug text primary key, status text not null default 'active', hidden boolean not null default false,
      input_modalities text[] not null default '{text}', output_modalities text[] not null default '{text}', variant_kind text not null default 'standard',
      replacement_model_slug text, retired_at timestamptz);
    create table public.v2_providers(provider_slug text primary key, status text not null default 'active', routing_enabled boolean not null default true);
    create table public.v2_model_provider_routes(provider_model_id text primary key, model_slug text not null, provider_slug text not null,
      routing_enabled boolean not null default true, context_length integer, metadata jsonb not null default '{}',
      effective_from timestamptz, effective_to timestamptz);
    create table public.v2_route_capabilities(provider_model_id text, capability_id text, status text not null default 'active',
      effective_from timestamptz, effective_to timestamptz);
    create table public.v2_pricing_skus(sku_id text primary key, provider_model_id text, sku_code text, status text not null default 'active',
      service_tier_slug text, effective_from timestamptz not null default now() - interval '1 day', effective_to timestamptz);
    create table public.v2_pricing_sku_meters(sku_id text, meter_key text, unit_quantity numeric not null default 1, price_nanos numeric not null,
      billable boolean not null default true);
  `);
  await db.exec(await read('../schemas/public/tables/v2_catalogue_admin_changes.sql'));
  await db.exec(await read('../migrations/20261015111100_model_successor_routing_approval.sql'));
  await db.exec(await read('../migrations/20261015111200_gateway_model_successor_redirect.sql'));
  assert.deepEqual((await db.query(`select model_successor_redirect_enabled e, model_successor_price_policy p, model_successor_max_price_increase_percent m from public.workspace_settings`)).rows,
    [{ e: false, p: 'never', m: 0 }]);
  await rejects(db.query(`update public.workspace_settings set model_successor_price_policy='sometimes'`), /price_policy_check/);

  await db.exec(`
    insert into public.v2_providers values ('host', 'active');
    insert into public.v2_models(model_slug, status, replacement_model_slug, variant_kind) values
      ('lab/old', 'retired', 'lab/mid', 'standard'),
      ('lab/mid', 'deprecated', 'lab/new', 'standard'),
      ('lab/new', 'active', null, 'standard'),
      ('lab/old:free', 'retired', 'lab/new', 'free');
    insert into public.v2_model_provider_routes(provider_model_id, model_slug, provider_slug, routing_enabled) values
      ('old-host', 'lab/old', 'host', false), ('mid-host', 'lab/mid', 'host', true),
      ('new-host', 'lab/new', 'host', true), ('free-host', 'lab/old:free', 'host', false);
    insert into public.v2_route_capabilities(provider_model_id, capability_id) values
      ('old-host', 'text.generate'), ('mid-host', 'text.generate'), ('new-host', 'text.generate'), ('free-host', 'text.generate');
    insert into public.v2_pricing_skus(sku_id, provider_model_id, sku_code) values
      ('old-sku', 'old-host', 'tokens'), ('mid-sku', 'mid-host', 'tokens'), ('new-sku', 'new-host', 'tokens');
    insert into public.v2_pricing_sku_meters(sku_id, meter_key, unit_quantity, price_nanos) values
      ('old-sku', 'input_tokens', 1000000, 2000000000), ('old-sku', 'output_tokens', 1000000, 8000000000),
      ('mid-sku', 'input_tokens', 1000000, 2000000000), ('mid-sku', 'output_tokens', 1000000, 8000000000),
      ('new-sku', 'input_tokens', 1000000, 2500000000), ('new-sku', 'output_tokens', 1000000, 8000000000);
  `);

  // Backend-only.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await rejects(db.query(`select public.gateway_resolve_model_successor('lab/old')`), /permission denied/);
    await db.exec('reset role');
  }

  // Unknown or hidden models resolve to nothing.
  assert.equal(await resolve('lab/missing'), null);

  // Unserved for less than 72 hours: no target yet, but the suggestion is there.
  await db.exec(`select public.refresh_model_unserved_since()`);
  let result = await resolve('lab/old');
  assert.deepEqual([result.target, result.reason, result.replacement_model, result.status], [null, 'within_grace_period', 'lab/mid', 'retired']);

  // Past the grace period without approval.
  await db.exec(`update public.v2_model_successor_routing set unserved_since = now() - interval '73 hours'`);
  assert.equal((await resolve('lab/old')).reason, 'not_approved');

  // Approved one hop to a served successor; the input price rises 25%.
  await db.exec(`insert into public.v2_model_successor_routing(model_slug, auto_route_enabled, approved_successor_slug, approved_at)
    values ('lab/mid', true, 'lab/new', now())`);
  await db.exec(`update public.v2_model_successor_routing set auto_route_enabled=true, approved_successor_slug='lab/mid', approved_at=now() where model_slug='lab/old'`);
  result = await resolve('lab/old');
  assert.deepEqual([result.target, result.chain, result.reason, result.price_ratio, result.price_comparable],
    ['lab/mid', ['lab/mid'], 'eligible', 1, true]);

  // When the successor stops serving too, the approved chain continues to the next model.
  await db.exec(`update public.v2_model_provider_routes set routing_enabled=false where provider_model_id='mid-host'`);
  result = await resolve('lab/old');
  assert.deepEqual([result.target, result.chain, result.reason, Number(result.price_ratio)], ['lab/new', ['lab/mid', 'lab/new'], 'eligible', 1.25]);

  // A changed replacement voids the approval for that hop.
  await db.exec(`update public.v2_models set replacement_model_slug='lab/new' where model_slug='lab/old'`);
  assert.equal((await resolve('lab/old')).reason, 'not_approved');
  await db.exec(`update public.v2_models set replacement_model_slug='lab/mid' where model_slug='lab/old'`);

  // A broken later hop leaves nothing to serve.
  await db.exec(`update public.v2_model_successor_routing set auto_route_enabled=false, approved_successor_slug=null, approved_at=null where model_slug='lab/mid'`);
  assert.deepEqual([(await resolve('lab/old')).target, (await resolve('lab/old')).reason], [null, 'no_served_successor']);

  // Free never redirects to paid, even if an approval row exists.
  await db.exec(`update public.v2_model_successor_routing set unserved_since=now() - interval '4 days', auto_route_enabled=true,
    approved_successor_slug='lab/new', approved_at=now() where model_slug='lab/old:free'`);
  result = await resolve('lab/old:free');
  assert.deepEqual([result.target, result.reason], [null, 'free_to_paid']);

  // An expired successor price does not count, however cheap.
  await db.exec(`update public.v2_model_successor_routing set auto_route_enabled=true, approved_successor_slug='lab/new', approved_at=now() where model_slug='lab/mid'`);
  await db.exec(`insert into public.v2_pricing_skus(sku_id, provider_model_id, sku_code, effective_to) values ('new-legacy-sku', 'new-host', 'legacy', now() - interval '1 hour');
    insert into public.v2_pricing_sku_meters(sku_id, meter_key, unit_quantity, price_nanos) values ('new-legacy-sku', 'input_tokens', 1000000, 1000000000)`);
  assert.equal(Number((await resolve('lab/old')).price_ratio), 1.25);

  // A charge only the successor bills makes the prices not comparable.
  await db.exec(`insert into public.v2_pricing_sku_meters(sku_id, meter_key, unit_quantity, price_nanos) values ('new-sku', 'requests', 1, 1000000)`);
  result = await resolve('lab/old');
  assert.deepEqual([result.target, result.price_ratio, result.price_comparable], ['lab/new', null, false]);
  await db.exec(`delete from public.v2_pricing_sku_meters where sku_id='new-sku' and meter_key='requests'`);
  assert.equal((await resolve('lab/old')).price_comparable, true);

  // Without shared priced meters the ratio is unknown.
  await db.exec(`update public.v2_pricing_sku_meters set meter_key='image_units' where sku_id='new-sku'`);
  result = await resolve('lab/old');
  assert.deepEqual([result.target, result.price_ratio, result.price_comparable], ['lab/new', null, false]);
  console.log('gateway resolves model successors');
} finally {
  await db.close();
}
