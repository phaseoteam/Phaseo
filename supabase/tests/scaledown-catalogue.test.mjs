import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(await read('../schemas/public/functions/canonical_routing_capability_id.sql'));
  // Use the real table definitions, including foreign keys and check constraints.
  // Full replay (triggers, RLS and schema equivalence) runs separately in CI.
  for (const name of [
    'v2_labs', 'v2_providers', 'v2_models', 'v2_model_aliases',
    'v2_model_provider_routes', 'v2_provider_regions', 'v2_service_tiers',
    'v2_route_variants', 'v2_route_capabilities', 'v2_meter_definitions',
    'v2_pricing_skus', 'v2_pricing_sku_meters', 'v2_model_links', 'v2_model_page_notices',
  ]) {
    const sql = await read(`../schemas/public/tables/${name}.sql`);
    await db.exec(sql.slice(0, sql.indexOf('\n);') + 3));
  }
  // Standard is seeded by an earlier post-baseline migration in full replay.
  await db.exec("insert into public.v2_service_tiers (service_tier_slug, display_name) values ('standard', 'Standard');");
  const migration = await read('../migrations/20261015102058_add_scaledown_task_models.sql');
  const projection = await read('../schemas/public/functions/get_v2_public_models_page_rows_without_lifecycle.sql');
  assert.ok(migration.replace(/\r\n/g, '\n').includes(projection.replace(/\r\n/g, '\n')));
  for (let run = 0; run < 2; run++) {
    await db.exec(migration);
    const { rows: providers } = await db.query('select provider_slug, status, routing_enabled, routable from public.v2_providers');
    assert.deepEqual(providers, [{ provider_slug: 'scaledown', status: 'not_ready', routing_enabled: false, routable: false }]);
    const { rows: models } = await db.query('select model_slug, hidden, status from public.v2_models order by model_slug');
    assert.deepEqual(models, ['classify-1', 'extract', 'summarize'].map(slug => ({ model_slug: `scaledown/${slug}`, hidden: false, status: 'active' })));
    const { rows: aliases } = await db.query('select alias_slug, model_slug, enabled from public.v2_model_aliases order by alias_slug');
    assert.deepEqual(aliases, [
      { alias_slug: 'scaledown/classify', model_slug: 'scaledown/classify-1', enabled: true },
      { alias_slug: 'scaledown/extract-1', model_slug: 'scaledown/extract', enabled: true },
      { alias_slug: 'scaledown/summarize-1', model_slug: 'scaledown/summarize', enabled: true },
    ]);
    const { rows: routes } = await db.query('select routing_enabled, provider_availability_status, phaseo_status, access_scope from public.v2_model_provider_routes');
    assert.deepEqual(routes, Array(3).fill({ routing_enabled: false, provider_availability_status: 'coming_soon', phaseo_status: 'testing', access_scope: 'public' }));
    const { rows: variants } = await db.query('select routing_enabled from public.v2_route_variants');
    assert.deepEqual(variants, Array(3).fill({ routing_enabled: false }));
    const { rows: capabilities } = await db.query('select status from public.v2_route_capabilities');
    assert.deepEqual(capabilities, Array(3).fill({ status: 'internal_testing' }));
    const { rows: prices } = await db.query(`select s.sku_code, m.direction, m.unit_quantity::text, m.price_nanos::text
      from public.v2_pricing_skus s join public.v2_pricing_sku_meters m using (sku_id) order by s.sku_code, m.direction`);
    assert.equal(prices.length, 6);
    for (const price of prices) {
      assert.equal(Number(price.unit_quantity), 1000000);
      assert.equal(Number(price.price_nanos), price.direction === 'input' ? 50000000 : 0);
    }
    for (const table of ['v2_pricing_skus', 'v2_model_links', 'v2_model_page_notices']) {
      assert.equal((await db.query(`select count(*)::int as count from public.${table}`)).rows[0].count, 3);
    }
    const { rows: pages } = await db.query('select payload from public.get_v2_public_models_page_rows_without_lifecycle(null, null) payload');
    assert.equal(pages.length, 3);
    for (const { payload } of pages) {
      assert.equal(payload.gateway_status, 'coming_soon');
      assert.equal(payload.gateway_active_provider_count, 0);
      assert.deepEqual(payload.gateway_endpoints, []);
      assert.equal(payload.gateway_provider_details[0].status, 'coming_soon');
      assert.equal(payload.gateway_provider_details[0].is_active, false);
    }
  }
  await db.exec("update public.v2_model_provider_routes set access_scope = 'internal';");
  assert.equal((await db.query('select * from public.get_v2_public_models_page_rows_without_lifecycle(null, null)')).rows.length, 0);
  await db.exec("update public.v2_model_provider_routes set access_scope = 'public';");
  await db.exec("update public.v2_providers set status = 'disabled';");
  assert.equal((await db.query('select * from public.get_v2_public_models_page_rows_without_lifecycle(null, null)')).rows.length, 0);
  await db.exec("update public.v2_providers set status = 'not_ready'; update public.v2_model_provider_routes set routing_enabled = true, phaseo_status = 'enabled', provider_availability_status = 'available'; update public.v2_route_variants set routing_enabled = true;");
  assert.equal((await db.query('select * from public.get_v2_public_models_page_rows_without_lifecycle(null, null)')).rows.length, 0);
  console.log('ScaleDown catalogue migration passed: fresh meters, idempotency, pricing and routing disabled');
} finally {
  await db.close();
}
