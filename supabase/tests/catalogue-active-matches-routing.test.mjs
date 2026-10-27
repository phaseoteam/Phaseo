import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The /models catalogue must call a route active only when the gateway's
// routing candidates (get_v2_routing_candidates) would include its provider.
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const page = async () => {
  const { rows } = await db.query('select payload from public.get_v2_public_models_page_rows_without_lifecycle(null, null) payload');
  return Object.fromEntries(rows.map(({ payload }) => [payload.model_id, payload]));
};
const summary = payload => payload && {
  gateway_status: payload.gateway_status,
  active: payload.gateway_active_provider_count,
  providers: payload.gateway_provider_details.map(detail => `${detail.id}:${detail.status}:${detail.is_active}`).sort(),
  endpoints: payload.gateway_endpoints,
};

try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(await read('../schemas/public/functions/canonical_routing_capability_id.sql'));
  // Real table definitions, including foreign keys and check constraints.
  for (const name of [
    'v2_labs', 'v2_providers', 'v2_models', 'v2_model_provider_routes', 'v2_provider_regions',
    'v2_service_tiers', 'v2_route_variants', 'v2_route_capabilities', 'v2_meter_definitions',
    'v2_pricing_skus', 'v2_pricing_sku_meters',
  ]) {
    const sql = await read(`../schemas/public/tables/${name}.sql`);
    await db.exec(sql.slice(0, sql.indexOf('\n);') + 3));
  }
  const migration = await read('../migrations/20261027124548_catalogue_active_matches_gateway_routing.sql');
  await db.exec(migration);
  await db.exec(`
    insert into public.v2_service_tiers (service_tier_slug, display_name) values ('standard', 'Standard');
    insert into public.v2_labs (lab_slug, name) values ('lab', 'Lab');
    insert into public.v2_providers (provider_slug, name, status, routing_enabled) values
      ('live', 'Live', 'active', true),
      ('outside', 'Outside', 'external', true),
      ('old', 'Old', 'deprecated', true);
    insert into public.v2_models (model_slug, name, lab_slug, status) values
      ('lab/mixed', 'Mixed', 'lab', 'active'),
      ('lab/external-only', 'External only', 'lab', 'active'),
      ('lab/external-override', 'External override', 'lab', 'active'),
      ('lab/deprecated-only', 'Deprecated only', 'lab', 'active'),
      ('lab/external-coming', 'External coming soon', 'lab', 'active');
    insert into public.v2_model_provider_routes
      (provider_model_id, model_slug, provider_slug, provider_model_slug, status, routing_enabled, provider_availability_status, access_scope, metadata, phaseo_status) values
      ('live:mixed', 'lab/mixed', 'live', 'mixed', 'active', true, 'available', 'public', '{}', 'enabled'),
      ('outside:mixed', 'lab/mixed', 'outside', 'mixed', 'active', true, 'available', 'public', '{}', 'enabled'),
      ('outside:external-only', 'lab/external-only', 'outside', 'external-only', 'active', true, 'available', 'public', '{}', 'enabled'),
      ('outside:external-override', 'lab/external-override', 'outside', 'external-override', 'active', true, 'available', 'public', '{"external_routing_override": "true"}', 'enabled'),
      ('old:deprecated-only', 'lab/deprecated-only', 'old', 'deprecated-only', 'active', true, 'available', 'public', '{}', 'enabled'),
      ('outside:external-coming', 'lab/external-coming', 'outside', 'external-coming', 'active', false, 'coming_soon', 'public', '{}', 'testing');
    insert into public.v2_route_variants (provider_model_id, variant_key, service_tier_slug, status, routing_enabled)
      select provider_model_id, 'standard', 'standard', 'active', routing_enabled from public.v2_model_provider_routes;
    insert into public.v2_route_capabilities (provider_model_id, capability_id, status)
      select provider_model_id, 'text.generate', 'active' from public.v2_model_provider_routes;
  `);

  const rows = await page();
  // A routable provider stays active; the external one beside it is dropped.
  assert.deepEqual(summary(rows['lab/mixed']), {
    gateway_status: 'active', active: 1, providers: ['live:active:true'], endpoints: ['text.generate'],
  });
  // No routable provider: the model leaves the routed rows (the catalogue then
  // lists it from the model table as not active) rather than showing as active.
  assert.equal(rows['lab/external-only'], undefined);
  assert.equal(rows['lab/deprecated-only'], undefined);
  // An external provider the route opts in to is routed, as in the gateway.
  assert.deepEqual(summary(rows['lab/external-override']), {
    gateway_status: 'active', active: 1, providers: ['outside:active:true'], endpoints: ['text.generate'],
  });
  // Coming-soon previews keep their behaviour and never count as active.
  assert.deepEqual(summary(rows['lab/external-coming']), {
    gateway_status: 'coming_soon', active: 0, providers: ['outside:coming_soon:false'], endpoints: [],
  });

  // The gateway agrees, model by model, on whether any provider is routable.
  for (const definition of ['get_v2_routing_candidates_raw', 'get_v2_routing_candidates']) {
    await db.exec(await read(`../schemas/public/functions/${definition}.sql`));
  }
  for (const [model, routable] of [
    ['lab/mixed', ['live']], ['lab/external-only', []], ['lab/external-override', ['outside']], ['lab/deprecated-only', []],
  ]) {
    const { rows: candidates } = await db.query(
      'select distinct provider_slug from public.get_v2_routing_candidates($1, null, null, null) where routing_enabled order by 1',
      [model],
    );
    assert.deepEqual(candidates.map(candidate => candidate.provider_slug), routable, model);
    const listed = rows[model]?.gateway_provider_details.filter(detail => detail.is_active).map(detail => detail.id) ?? [];
    assert.deepEqual(listed, routable, model);
  }
  console.log('Catalogue active routes match gateway routing candidates');
} finally {
  await db.close();
}
