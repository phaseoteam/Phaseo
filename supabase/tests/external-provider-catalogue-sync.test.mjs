import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const normalise = text => text.replace(/\r\n/g, '\n');

const migration = normalise(await read('../migrations/20261113140000_external_provider_catalogue_sync.sql'));
const schema = normalise(await read('../schemas/public/functions/sync_external_provider_catalogue.sql'));
const T0 = '2026-11-14T05:23:00Z';
const day = n => new Date(Date.parse(T0) + n * 86_400_000).toISOString();

const sync = async (models, at, provider = 'gw') =>
	(await db.query('select public.sync_external_provider_catalogue($1, $2, $3) as summary', [provider, JSON.stringify(models), at])).rows[0].summary;
const route = async id => (await db.query(
	"select context_length, max_output_tokens, provider_availability_status as availability, metadata->'external_sync' as marker from public.v2_model_provider_routes where provider_model_id = $1",
	[id],
)).rows[0];
const activePrices = async id => (await db.query(`
	select sku.sku_code, sku.version, jsonb_object_agg(meter.meter_key, meter.price_nanos::numeric / meter.unit_quantity * 1000000 / 1000000000) as usd_per_million
	from public.v2_pricing_skus sku join public.v2_pricing_sku_meters meter using (sku_id)
	where sku.provider_model_id = $1 and sku.effective_to is null group by sku.sku_code, sku.version order by sku.version`, [id])).rows;

try {
	assert.ok(migration.includes(schema), 'the migration contains the declarative function file verbatim');

	await db.exec('create role anon; create role authenticated; create role service_role;');
	await db.exec(await read('../schemas/public/functions/canonical_routing_capability_id.sql'));
	for (const name of [
		'v2_labs', 'v2_providers', 'v2_models', 'v2_model_aliases', 'v2_model_provider_routes', 'v2_provider_regions', 'v2_service_tiers',
		'v2_route_variants', 'v2_route_capabilities', 'v2_meter_definitions', 'v2_pricing_skus', 'v2_pricing_sku_meters',
	]) {
		const sql = await read(`../schemas/public/tables/${name}.sql`);
		await db.exec(sql.slice(0, sql.indexOf('\n);') + 3));
	}
	await db.exec(migration);

	await db.exec(`
		insert into public.v2_service_tiers (service_tier_slug, display_name) values ('standard', 'Standard');
		insert into public.v2_meter_definitions (meter_key, display_name, modality, direction, unit, default_unit_quantity) values
			('input_text_tokens', 'Input', 'text', 'input', 'token', 1000000),
			('output_text_tokens', 'Output', 'text', 'output', 'token', 1000000),
			('cached_read_text_tokens', 'Cached input', 'text', 'input', 'token', 1000000),
			('cached_write_text_tokens', 'Cache write', 'text', 'input', 'token', 1000000),
			('input_image_tokens', 'Image input', 'image', 'input', 'token', 1000000);
		insert into public.v2_labs (lab_slug, name) values ('lab', 'Lab');
		insert into public.v2_providers (provider_slug, name, status) values ('gw', 'Gateway', 'external'), ('direct', 'Direct', 'active');
		insert into public.v2_models (model_slug, lab_slug, name) values
			('lab/a', 'lab', 'A'), ('lab/b', 'lab', 'B'), ('lab/c', 'lab', 'C'), ('lab/d', 'lab', 'D'), ('lab/e', 'lab', 'E');
		insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, provider_model_slug, status, routing_enabled, phaseo_status, provider_availability_status, context_length, max_output_tokens) values
			('gw:a', 'lab/a', 'gw', 'Lab/A', 'active', false, 'unsupported', 'available', 1000, null),
			('gw:b', 'lab/b', 'gw', 'lab/b', 'active', false, 'unsupported', 'removed', 1000, null),
			('gw:c', 'lab/c', 'gw', 'lab/c', 'active', false, 'unsupported', 'available', 1000, null),
			('gw:d', 'lab/d', 'gw', 'lab/d', 'active', false, 'unsupported', 'available', 1000, null),
			('gw:e', 'lab/e', 'gw', 'lab/e', 'active', false, 'unsupported', 'available', null, null),
			('direct:a', 'lab/a', 'direct', 'lab/a', 'active', false, 'unsupported', 'available', 1000, null);
		insert into public.v2_route_variants (provider_model_id, variant_key, service_tier_slug, status, routing_enabled)
			select provider_model_id, 'global:standard', 'standard', 'active', false from public.v2_model_provider_routes;
		insert into public.v2_route_capabilities (provider_model_id, capability_id, status) values ('gw:e', 'text.generate', 'active');
		insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code, version, operation, status, service_tier_slug, display_name, currency, effective_from, metadata) values
			('00000000-0000-0000-0000-00000000000a', 'gw:a', 'offer-a', 1, 'text.generate', 'active', 'standard', 'standard text.generate', 'USD', '2026-08-01', '{"match": []}'),
			('00000000-0000-0000-0000-00000000000d', 'gw:d', 'offer-d', 1, 'text.generate', 'active', 'standard', 'short prompts', 'USD', '2026-08-01', '{"match": [{"param": "input_tokens", "op": "<=", "value": 200000}]}');
		insert into public.v2_pricing_sku_meters (sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit) values
			('00000000-0000-0000-0000-00000000000a', 'input_text_tokens', 'text', 'input', 'token', 1000000, 1000000000, 'Input', '1000000 token'),
			('00000000-0000-0000-0000-00000000000a', 'output_text_tokens', 'text', 'output', 'token', 1000000, 2000000000, 'Output', '1000000 token'),
			('00000000-0000-0000-0000-00000000000a', 'input_image_tokens', 'image', 'input', 'token', 1000000, 500000000, 'Image input', '1000000 token'),
			('00000000-0000-0000-0000-00000000000d', 'input_text_tokens', 'text', 'input', 'token', 1000000, 1000000000, 'Input', '1000000 token'),
			('00000000-0000-0000-0000-00000000000d', 'output_text_tokens', 'text', 'output', 'token', 1000000, 2000000000, 'Output', '1000000 token');
	`);

	const listed = [
		{ id: 'lab/a', context_length: 2000, max_output_tokens: 512, meters: { input_text_tokens: 1.5, output_text_tokens: 2, cached_read_text_tokens: 0.1, bogus_meter: 9 } },
		{ id: 'lab/b', context_length: 1000 },
		{ id: 'lab/d', meters: { input_text_tokens: 3, output_text_tokens: 6 } },
		{ id: 'lab/e', context_length: 4096, meters: { input_text_tokens: 0.2, output_text_tokens: 0.4, cached_read_text_tokens: -1 } },
		{ id: 'lab/new' },
	];

	// First run: limits, a restored route, a missing route noted, one price revised, one added, one skipped.
	const first = await sync(listed, T0);
	assert.deepEqual(
		{ ...first, unmatched_sample: undefined },
		{
			provider: 'gw', listed: 5, routes: 5, matched: 4, added: 0, added_sample: [], limits_updated: 2, restored: 1, missing_cleared: 0,
			newly_missing: 1, removed: 0, removals_skipped: false, prices_changed: 1, prices_added: 1,
			prices_skipped_conditional: 1, unmatched: 1, unmatched_sample: undefined,
		},
	);
	assert.deepEqual(first.unmatched_sample, ['lab/new']);
	assert.deepEqual(await route('gw:a'), { context_length: 2000, max_output_tokens: 512, availability: 'available', marker: null });
	assert.equal((await route('gw:b')).availability, 'available');
	assert.deepEqual((await route('gw:c')).marker, { missing_since: '2026-11-14T05:23:00+00:00' });
	assert.equal((await route('gw:c')).availability, 'available');
	assert.equal((await route('direct:a')).context_length, 1000, 'non-external providers are untouched');

	assert.deepEqual(await activePrices('gw:a'), [{
		sku_code: 'offer-a', version: 2,
		usd_per_million: { input_text_tokens: 1.5, output_text_tokens: 2, input_image_tokens: 0.5, cached_read_text_tokens: 0.1 },
	}]);
	const { rows: [{ ended }] } = await db.query("select effective_to as ended from public.v2_pricing_skus where provider_model_id = 'gw:a' and version = 1");
	assert.equal(new Date(ended).toISOString(), new Date(T0).toISOString());
	assert.deepEqual(await activePrices('gw:e'), [{ sku_code: 'external-sync', version: 1, usd_per_million: { input_text_tokens: 0.2, output_text_tokens: 0.4 } }]);
	const { rows: [{ linked }] } = await db.query("select route_variant_id is not null as linked from public.v2_pricing_skus where provider_model_id = 'gw:e'");
	assert.equal(linked, true);
	assert.deepEqual((await activePrices('gw:d')).map(price => price.version), [1], 'conditional prices are left alone');

	// Running again with the same list writes nothing.
	const { rows: [{ before }] } = await db.query('select count(*)::int as before from public.v2_pricing_skus');
	const second = await sync(listed, day(1));
	assert.equal(second.limits_updated + second.restored + second.newly_missing + second.removed + second.prices_changed + second.prices_added, 0);
	const { rows: [{ after }] } = await db.query('select count(*)::int as after from public.v2_pricing_skus');
	assert.equal(after, before);

	// An empty list never removes anything.
	const empty = await sync([], day(5));
	assert.equal(empty.removals_skipped, true);
	// Nor does a list that recognises under a quarter of the routes (for example after an ID format change).
	const renamed = await sync([{ id: 'renamed/a' }, { id: 'renamed/b' }], day(5));
	assert.equal(renamed.removals_skipped, true);
	assert.equal(renamed.newly_missing, 0);
	assert.equal((await route('gw:a')).availability, 'available');

	// After three days missing, the route is marked removed; when it comes back it is restored.
	const later = await sync(listed, day(4));
	assert.equal(later.removed, 1);
	assert.equal((await route('gw:c')).availability, 'removed');
	const back = await sync([...listed, { id: 'lab/c' }], day(6));
	assert.equal(back.restored, 1);
	assert.deepEqual(await route('gw:c'), { context_length: 1000, max_output_tokens: null, availability: 'available', marker: null });

	// New listings on a second gateway: routes are added only when the upstream ID names one model.
	await db.exec(`
		insert into public.v2_providers (provider_slug, name, status) values ('gw2', 'Gateway 2', 'external');
		insert into public.v2_models (model_slug, lab_slug, name, input_modalities, output_modalities) values
			('lab/f', 'lab', 'F', '{text}', '{text}'),
			('lab/g', 'lab', 'G', '{text}', '{image}'),
			('lab/h', 'lab', 'H', '{text}', '{text}'),
			('lab/i', 'lab', 'I', '{text}', '{text}');
		insert into public.v2_model_aliases (alias_slug, model_slug) values ('lab/i-latest', 'lab/i');
		-- gw2 already names lab/a "vend/a", which teaches it that vend/ means lab/.
		insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, provider_model_slug, status, routing_enabled, phaseo_status, provider_availability_status) values
			('gw2:vend/a', 'lab/a', 'gw2', 'vend/a', 'active', false, 'unsupported', 'available'),
			('direct:other/h', 'lab/h', 'direct', 'other/h', 'active', false, 'unsupported', 'available');
	`);
	const added = await sync([
		{ id: 'vend/a' },
		{ id: 'vend/f', context_length: 8192, meters: { input_text_tokens: 1, output_text_tokens: 2 } },
		{ id: 'lab/g' },
		{ id: 'other/h' },
		{ id: 'lab/i-latest' },
		{ id: 'vend/f:batch' },
		{ id: 'vend/f-fast' },
		{ id: 'lab/a' },
		{ id: 'vend/unknown' },
	], T0, 'gw2');
	assert.equal(added.added, 4);
	assert.deepEqual(added.added_sample, ['lab/f', 'lab/g', 'lab/h', 'lab/i']);
	const { rows: newRoutes } = await db.query(`
		select route.provider_model_id, route.model_slug, route.routing_enabled, route.phaseo_status, route.context_length,
			route.metadata->'external_sync_added'->>'matched_by' as matched_by,
			(select count(*)::int from public.v2_route_variants variant where variant.provider_model_id = route.provider_model_id) as variants,
			(select count(*)::int from public.v2_route_capabilities capability where capability.provider_model_id = route.provider_model_id) as capabilities
		from public.v2_model_provider_routes route where route.provider_slug = 'gw2' and route.metadata ? 'external_sync_added' order by route.model_slug`);
	assert.deepEqual(newRoutes, [
		{ provider_model_id: 'gw2:vend/f', model_slug: 'lab/f', routing_enabled: false, phaseo_status: 'unsupported', context_length: 8192, matched_by: 'org_prefix', variants: 1, capabilities: 1 },
		{ provider_model_id: 'gw2:lab/g', model_slug: 'lab/g', routing_enabled: false, phaseo_status: 'unsupported', context_length: null, matched_by: 'model_id', variants: 1, capabilities: 0 },
		{ provider_model_id: 'gw2:other/h', model_slug: 'lab/h', routing_enabled: false, phaseo_status: 'unsupported', context_length: null, matched_by: 'other_provider_route', variants: 1, capabilities: 1 },
		{ provider_model_id: 'gw2:lab/i-latest', model_slug: 'lab/i', routing_enabled: false, phaseo_status: 'unsupported', context_length: null, matched_by: 'alias', variants: 1, capabilities: 1 },
	]);
	// lab/a already has a gw2 route, so "lab/a" is not added as a second one; variants and unknowns stay unmatched.
	assert.equal(added.unmatched, 4);
	assert.deepEqual(await activePrices('gw2:vend/f'), [{ sku_code: 'external-sync', version: 1, usd_per_million: { input_text_tokens: 1, output_text_tokens: 2 } }]);
	const repeat = await sync([{ id: 'vend/a' }, { id: 'vend/f' }, { id: 'lab/g' }, { id: 'other/h' }, { id: 'lab/i-latest' }], day(1), 'gw2');
	assert.equal(repeat.added, 0);

	await assert.rejects(sync(listed, T0, 'direct'), /not an external provider/);
	await assert.rejects(sync(listed, T0, 'missing'), /not an external provider/);

	console.log('external provider catalogue sync: ok');
} finally {
	await db.close();
}
