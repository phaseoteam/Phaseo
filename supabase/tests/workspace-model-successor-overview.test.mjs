import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const WS = '20000000-0000-4000-8000-000000000001';
const OTHER = '20000000-0000-4000-8000-000000000002';
const overview = async (workspace = WS) => (await db.query('select public.get_workspace_model_successor_overview($1) as value', [workspace])).rows[0].value;
const row = (rows, model) => rows.find(item => item.model === model);
const rejects = async (promise, pattern) => assert.match((await promise.then(() => null, error => error)).message, pattern);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create schema cron; create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
    create table public.users(user_id uuid primary key, role text);
    create table public.workspaces(id uuid primary key);
    insert into public.workspaces values ('${WS}'), ('${OTHER}');
    create table public.workspace_settings(workspace_id uuid primary key);
    create table public.v2_models(model_slug text primary key, name text, status text not null default 'active', hidden boolean not null default false,
      input_modalities text[] not null default '{text}', output_modalities text[] not null default '{text}', variant_kind text not null default 'standard',
      replacement_model_slug text, deprecated_at timestamptz, retired_at timestamptz);
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
    create table public.v2_request_facts(workspace_id uuid, requested_model_slug text, routed_model_slug text, success boolean not null default true,
      occurred_at timestamptz not null default now());
  `);
  await db.exec(await read('../schemas/public/tables/v2_catalogue_admin_changes.sql'));
  for (const migration of [
    '20261015111100_model_successor_routing_approval',
    '20261015111200_gateway_model_successor_redirect',
    '20261015111300_workspace_model_successor_overrides',
    '20261023210737_model_successor_price_comparison',
    '20261029102725_workspace_model_successor_overview',
  ]) await db.exec(await read(`../migrations/${migration}.sql`));

  await db.exec(`
    insert into public.v2_providers values ('host', 'active');
    insert into public.v2_models(model_slug, name, status, replacement_model_slug, deprecated_at, retired_at) values
      ('lab/old', 'Old', 'retired', 'lab/new', '2026-06-01', '2026-09-01'),
      ('lab/soon', 'Soon', 'deprecated', 'lab/new', '2026-10-01', now() + interval '10 days'),
      ('lab/new', 'New', 'active', null, null, null),
      ('lab/other', 'Other', 'active', null, null, null),
      ('lab/current', 'Current', 'active', null, null, null),
      ('lab/hidden', 'Hidden', 'retired', 'lab/new', null, '2026-09-01');
    update public.v2_models set hidden=true where model_slug='lab/hidden';
    insert into public.v2_model_provider_routes(provider_model_id, model_slug, provider_slug, routing_enabled) values
      ('old-host', 'lab/old', 'host', false), ('soon-host', 'lab/soon', 'host', true),
      ('new-host', 'lab/new', 'host', true), ('other-host', 'lab/other', 'host', true), ('current-host', 'lab/current', 'host', true);
    insert into public.v2_route_capabilities(provider_model_id, capability_id) values
      ('old-host', 'text.generate'), ('soon-host', 'text.generate'), ('new-host', 'text.generate'),
      ('other-host', 'text.generate'), ('current-host', 'text.generate');
    insert into public.v2_pricing_skus(sku_id, provider_model_id, sku_code) values
      ('old-sku', 'old-host', 'tokens'), ('soon-sku', 'soon-host', 'tokens'), ('new-sku', 'new-host', 'tokens'), ('other-sku', 'other-host', 'tokens');
    insert into public.v2_pricing_sku_meters(sku_id, meter_key, unit_quantity, price_nanos) values
      ('old-sku', 'input_text_tokens', 1000000, 2000000000), ('old-sku', 'output_text_tokens', 1000000, 8000000000),
      ('soon-sku', 'input_text_tokens', 1000000, 1000000000), ('soon-sku', 'output_text_tokens', 1000000, 4000000000),
      ('new-sku', 'input_text_tokens', 1000000, 2500000000), ('new-sku', 'output_text_tokens', 1000000, 8000000000),
      ('new-sku', 'native_web_search_requests', 1000, 10000000000),
      ('other-sku', 'input_text_tokens', 1000000, 1000000000), ('other-sku', 'output_text_tokens', 1000000, 1000000000);
    insert into public.v2_model_successor_routing(model_slug, unserved_since, auto_route_enabled, approved_successor_slug, approved_at) values
      ('lab/old', now() - interval '5 days', true, 'lab/new', now()),
      ('lab/soon', null, true, 'lab/new', now());
    insert into public.v2_request_facts(workspace_id, requested_model_slug, routed_model_slug, success, occurred_at) values
      ('${WS}', 'lab/old', 'lab/new', true, now() - interval '1 day'),
      ('${WS}', 'lab/old', 'lab/new', true, now() - interval '2 days'),
      ('${WS}', 'lab/old', null, false, now() - interval '6 days'),
      ('${WS}', 'lab/old', 'lab/old', true, now() - interval '40 days'),
      ('${WS}', 'lab/soon', 'lab/soon', true, now() - interval '3 hours'),
      ('${WS}', 'lab/current', 'lab/current', true, now()),
      ('${WS}', 'lab/hidden', 'lab/hidden', true, now()),
      ('${WS}', 'lab/old', 'lab/new', true, now() - interval '120 days'),
      ('${OTHER}', 'lab/soon', 'lab/soon', true, now());
  `);

  // Backend-only.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await rejects(db.query(`select public.get_workspace_model_successor_overview('${WS}')`), /permission denied/);
    await db.exec('reset role');
  }

  let rows = await overview();
  // Only models being retired or no longer served that this workspace used in
  // 90 days: not current or hidden models, most recently used first.
  assert.deepEqual(rows.map(item => item.model), ['lab/soon', 'lab/old']);

  // Unserved past the grace period with an approved replacement: redirecting,
  // with the price ratio and the meters a request could still add.
  const old = row(rows, 'lab/old');
  assert.deepEqual(
    [old.reason, old.target, old.replacement, old.replacement_name, old.approved, old.workspace_override, old.requests, Number(old.price_ratio), old.price_comparable, old.price_skipped_meters],
    ['eligible', 'lab/new', 'lab/new', 'New', true, false, 4, 1.25, true, ['native_web_search_requests']]);
  // Requests another model answered in the last 30 days.
  assert.deepEqual(old.served_by.map(item => [item.model, item.requests]), [['lab/new', 2]]);

  // Still served: no target yet, but the approved replacement is priced.
  const soon = row(rows, 'lab/soon');
  assert.deepEqual([soon.reason, soon.target, soon.unserved_since, soon.replacement, Number(soon.price_ratio), soon.served_by],
    ['within_grace_period', null, null, 'lab/new', 2.5, []]);

  // Without an approval there is no replacement to show, only Phaseo's suggestion.
  await db.exec(`update public.v2_model_successor_routing set auto_route_enabled=false, approved_successor_slug=null, approved_at=null where model_slug='lab/soon'`);
  const unapproved = row(await overview(), 'lab/soon');
  assert.deepEqual([unapproved.replacement, unapproved.suggested_replacement, unapproved.price_ratio], [null, 'lab/new', null]);

  // The workspace's own replacements: "never", and a chosen model, which
  // needs no approval. A model with its own replacement is listed even unused.
  await db.exec(`insert into public.workspace_model_successor_overrides(workspace_id, model_slug, successor_model_slug) values
    ('${WS}', 'lab/old', null), ('${WS}', 'lab/soon', 'lab/other')`);
  rows = await overview();
  assert.deepEqual([row(rows, 'lab/old').reason, row(rows, 'lab/old').target, row(rows, 'lab/old').workspace_override], ['never', null, true]);
  assert.deepEqual([row(rows, 'lab/soon').replacement, row(rows, 'lab/soon').workspace_override, Number(row(rows, 'lab/soon').price_ratio)], ['lab/other', true, 1]);
  await db.exec(`insert into public.v2_models(model_slug, name, status, retired_at) values ('lab/unused', 'Unused', 'retired', '2026-08-01');
    insert into public.workspace_model_successor_overrides(workspace_id, model_slug, successor_model_slug) values ('${WS}', 'lab/unused', 'lab/new')`);
  rows = await overview();
  assert.deepEqual([row(rows, 'lab/unused').requests, row(rows, 'lab/unused').last_used_at], [0, null]);

  // Another workspace sees only its own use.
  assert.deepEqual((await overview(OTHER)).map(item => [item.model, item.requests]), [['lab/soon', 1]]);

  console.log('workspace model successor overview');
} finally {
  await db.close();
}
