import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
	new URL("../migrations/20261011080000_cheapest_provider_catalogue_pricing.sql", import.meta.url),
	"utf8",
);

// Only the columns the page projection reads.
const schema = `
	create table public.v2_labs (lab_slug text primary key, name text);
	create table public.v2_models (
		model_slug text primary key, name text, description text, status text default 'available',
		catalogue_status text, hidden boolean default false, announced_at timestamptz, released_at timestamptz,
		input_modalities text[] default array['text'], output_modalities text[] default array['text'], lab_slug text
	);
	create table public.v2_providers (provider_slug text primary key, name text, status text default 'active', routing_enabled boolean default true);
	create table public.v2_model_provider_routes (
		provider_model_id text primary key, model_slug text, provider_slug text, provider_model_slug text,
		input_modalities text[] default array['text'], output_modalities text[] default array['text'],
		context_length integer, max_output_tokens integer, status text default 'active', routing_enabled boolean default true,
		provider_availability_status text default 'available', regions text[] default array[]::text[]
	);
	create table public.v2_route_variants (
		variant_id uuid primary key default gen_random_uuid(), provider_model_id text, service_tier_slug text default 'standard',
		execution_region text, data_region text, status text default 'active', routing_enabled boolean default true
	);
	create table public.v2_provider_regions (provider_slug text, region_code text, status text default 'active', routing_enabled boolean default true);
	create table public.v2_route_capabilities (provider_model_id text, capability_id text, status text default 'active', params jsonb default '{}');
	create table public.v2_pricing_skus (
		sku_id uuid primary key default gen_random_uuid(), provider_model_id text, sku_code text, version integer default 1, operation text default 'inference',
		status text default 'active', region text, service_tier_slug text default 'standard',
		effective_from timestamptz default now() - interval '1 day', effective_to timestamptz, route_variant_id uuid
	);
	create table public.v2_pricing_sku_meters (
		sku_id uuid, meter_key text, modality text default 'text', direction text, unit text default 'token',
		unit_quantity numeric default 1000000, price_nanos numeric, display_label text, display_unit text default '1M tokens',
		billable boolean default true, meter_order integer default 100
	);
`;

const fixtures = `
	insert into public.v2_labs values ('cloudflare', 'Cloudflare'), ('openai', 'OpenAI');
	insert into public.v2_models (model_slug, name, lab_slug) values
		('cloudflare/clef-flash', 'Clef Flash', 'cloudflare'), ('openai/gpt-test', 'GPT Test', 'openai');
	insert into public.v2_providers (provider_slug, name, status, routing_enabled) values
		('cloudflare', 'Cloudflare', 'active', true), ('crossmodel', 'CrossModel', 'active', true), ('openai', 'OpenAI', 'active', true);
	insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, status, routing_enabled, regions) values
		('cf:clef-flash', 'cloudflare/clef-flash', 'cloudflare', 'active', true, array['us', 'eu']);
	insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, status, routing_enabled) values
		('crossmodel:clef-flash', 'cloudflare/clef-flash', 'crossmodel', 'disabled', false),
		('openai:gpt-test', 'openai/gpt-test', 'openai', 'active', true);
	insert into public.v2_route_variants (variant_id, provider_model_id, service_tier_slug, execution_region) values
		('00000000-0000-0000-0000-000000000001', 'cf:clef-flash', 'standard', null),
		('00000000-0000-0000-0000-000000000002', 'openai:gpt-test', 'standard', null),
		('00000000-0000-0000-0000-000000000003', 'openai:gpt-test', 'standard', 'eu'),
		('00000000-0000-0000-0000-000000000004', 'openai:gpt-test', 'batch', null);
	insert into public.v2_route_variants (variant_id, provider_model_id, service_tier_slug, status, routing_enabled) values
		('00000000-0000-0000-0000-000000000005', 'openai:gpt-test', 'priority', 'disabled', false);

	insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code, effective_from, route_variant_id, service_tier_slug, status) values
		('10000000-0000-0000-0000-000000000001', 'cf:clef-flash', 'official', now() - interval '10 days', '00000000-0000-0000-0000-000000000001', 'standard', 'active'),
		('10000000-0000-0000-0000-000000000002', 'cf:clef-flash', 'provider-models', now() - interval '2 days', '00000000-0000-0000-0000-000000000001', 'standard', 'active'),
		('10000000-0000-0000-0000-000000000003', 'crossmodel:clef-flash', 'audit', now() - interval '3 days', null, 'standard', 'active'),
		('20000000-0000-0000-0000-000000000001', 'openai:gpt-test', 'standard-short', now() - interval '5 days', '00000000-0000-0000-0000-000000000002', 'standard', 'active'),
		('20000000-0000-0000-0000-000000000002', 'openai:gpt-test', 'standard-long', now() - interval '2 days', '00000000-0000-0000-0000-000000000002', 'standard', 'active'),
		('20000000-0000-0000-0000-000000000003', 'openai:gpt-test', 'eu', now() - interval '5 days', '00000000-0000-0000-0000-000000000003', 'standard', 'active'),
		('20000000-0000-0000-0000-000000000004', 'openai:gpt-test', 'batch', now() - interval '5 days', '00000000-0000-0000-0000-000000000004', 'batch', 'active'),
		('20000000-0000-0000-0000-000000000005', 'openai:gpt-test', 'draft', now() - interval '1 days', '00000000-0000-0000-0000-000000000002', 'standard', 'draft'),
		('20000000-0000-0000-0000-000000000006', 'openai:gpt-test', 'hidden-variant', now() - interval '5 days', '00000000-0000-0000-0000-000000000005', 'priority', 'active');

	insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code, version, route_variant_id) values
		('30000000-0000-0000-0000-000000000001', 'cf:clef-flash', 'repriced', 1, '00000000-0000-0000-0000-000000000001'),
		('30000000-0000-0000-0000-000000000002', 'cf:clef-flash', 'repriced', 2, '00000000-0000-0000-0000-000000000001');
	insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code, version, region) values
		('30000000-0000-0000-0000-000000000003', 'cf:clef-flash', 'moved', 1, null),
		('30000000-0000-0000-0000-000000000004', 'cf:clef-flash', 'moved', 2, 'eu');
	insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code, version, service_tier_slug) values
		('30000000-0000-0000-0000-000000000005', 'cf:clef-flash', 'tiermove', 1, 'standard'),
		('30000000-0000-0000-0000-000000000006', 'cf:clef-flash', 'tiermove', 2, 'priority');
	insert into public.v2_route_variants (variant_id, provider_model_id, service_tier_slug, data_region) values
		('00000000-0000-0000-0000-000000000006', 'openai:gpt-test', 'standard', 'eu');
	insert into public.v2_route_variants (variant_id, provider_model_id, service_tier_slug, execution_region, data_region) values
		('00000000-0000-0000-0000-000000000007', 'openai:gpt-test', 'standard', 'us', 'eu');
	insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code, route_variant_id) values
		('30000000-0000-0000-0000-000000000007', 'openai:gpt-test', 'eu-data', '00000000-0000-0000-0000-000000000006'),
		('30000000-0000-0000-0000-000000000008', 'openai:gpt-test', 'us-run-eu-data', '00000000-0000-0000-0000-000000000007');

	-- A coming-soon preview route next to a routable one, a preview-only model,
	-- and one provider with two routes for the same model.
	insert into public.v2_labs values ('acme', 'Acme');
	insert into public.v2_models (model_slug, name, lab_slug) values
		('acme/preview-only', 'Preview Only', 'acme'), ('acme/two-routes', 'Two Routes', 'acme');
	insert into public.v2_providers (provider_slug, name) values ('soon', 'Soon'), ('acme', 'Acme');
	insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, routing_enabled, provider_availability_status) values
		('soon:clef-flash', 'cloudflare/clef-flash', 'soon', false, 'coming_soon'),
		('soon:preview-only', 'acme/preview-only', 'soon', false, 'coming_soon'),
		('acme:two-a', 'acme/two-routes', 'acme', true, 'available'),
		('acme:two-b', 'acme/two-routes', 'acme', true, 'available');
	insert into public.v2_route_variants (provider_model_id, routing_enabled) values
		('soon:clef-flash', false), ('soon:preview-only', false), ('acme:two-a', true), ('acme:two-b', true);
	insert into public.v2_pricing_skus (sku_id, provider_model_id, sku_code) values
		('40000000-0000-0000-0000-000000000001', 'soon:clef-flash', 'preview'),
		('40000000-0000-0000-0000-000000000002', 'soon:preview-only', 'preview'),
		('40000000-0000-0000-0000-000000000003', 'acme:two-a', 'a'),
		('40000000-0000-0000-0000-000000000004', 'acme:two-b', 'b');

	insert into public.v2_pricing_sku_meters (sku_id, meter_key, direction, price_nanos, display_label) values
		('40000000-0000-0000-0000-000000000001', 'input_tokens', 'input', 1000000, 'Input Tokens'),
		('40000000-0000-0000-0000-000000000002', 'input_tokens', 'input', 7000000, 'Input Tokens'),
		('40000000-0000-0000-0000-000000000003', 'input_tokens', 'input', 1000000000, 'Input Tokens'),
		('40000000-0000-0000-0000-000000000004', 'output_tokens', 'output', 2000000000, 'Output Tokens'),
		('30000000-0000-0000-0000-000000000001', 'output_tokens', 'output', 500000000, 'Output Tokens'),
		('30000000-0000-0000-0000-000000000002', 'output_tokens', 'output', 300000000, 'Output Tokens'),
		('30000000-0000-0000-0000-000000000001', 'requests', 'input', 10000000, 'Requests'),
		('30000000-0000-0000-0000-000000000003', 'image_inputs', 'input', 20000000, 'Image Inputs'),
		('30000000-0000-0000-0000-000000000004', 'image_inputs', 'input', 30000000, 'Image Inputs'),
		('30000000-0000-0000-0000-000000000005', 'video_inputs', 'input', 40000000, 'Video Inputs'),
		('30000000-0000-0000-0000-000000000006', 'video_inputs', 'input', 50000000, 'Video Inputs'),
		('30000000-0000-0000-0000-000000000007', 'input_text_tokens', 'input', 2400000000, 'Input Text Tokens'),
		('30000000-0000-0000-0000-000000000008', 'input_text_tokens', 'input', 2600000000, 'Input Text Tokens'),
		('10000000-0000-0000-0000-000000000001', 'input_tokens', 'input', 90000000, 'Input Tokens'),
		('10000000-0000-0000-0000-000000000002', 'input_tokens', 'input', 38000000, 'Input Tokens'),
		('10000000-0000-0000-0000-000000000003', 'input_tokens', 'input', 90000000, 'Input Tokens'),
		('10000000-0000-0000-0000-000000000003', 'output_tokens', 'output', 0, 'Output Tokens'),
		('20000000-0000-0000-0000-000000000001', 'input_text_tokens', 'input', 2000000000, 'Input Text Tokens'),
		('20000000-0000-0000-0000-000000000001', 'output_text_tokens', 'output', 10000000000, 'Output Text Tokens'),
		('20000000-0000-0000-0000-000000000002', 'input_text_tokens', 'input', 4000000000, 'Input Text Tokens'),
		('20000000-0000-0000-0000-000000000002', 'output_text_tokens', 'output', 15000000000, 'Output Text Tokens'),
		('20000000-0000-0000-0000-000000000003', 'input_text_tokens', 'input', 2200000000, 'Input Text Tokens'),
		('20000000-0000-0000-0000-000000000003', 'audio_seconds', 'input', 1000000, 'Audio Seconds'),
		('20000000-0000-0000-0000-000000000004', 'input_text_tokens', 'input', 1000000000, 'Input Text Tokens'),
		('20000000-0000-0000-0000-000000000005', 'input_text_tokens', 'input', 500000000, 'Input Text Tokens'),
		('20000000-0000-0000-0000-000000000006', 'input_text_tokens', 'input', 100000000, 'Input Text Tokens');
`;

async function pricing(db, region = null, tier = null) {
	const result = await db.query(
		"select payload->>'model_id' as model_id, payload->'pricing_detail_rows' as rows from public.get_v2_public_models_page_rows_without_lifecycle($1, $2) payload",
		[region, tier],
	);
	return Object.fromEntries(result.rows.map((row) => [
		row.model_id,
		row.rows.map((meter) => `${meter.provider_group}|${meter.service_tier}|${meter.meter_key}|${meter.direction}|${Number(meter.price)}`).sort(),
	]));
}

test("models page pricing uses current, active, global SKUs from shown routes", async () => {
	const db = new PGlite();
	try {
		await db.exec("create role anon; create role authenticated; create role service_role;");
		await db.exec(schema);
		await db.exec(fixtures);
		await db.exec(migration);

		const all = await pricing(db);
		// The disabled CrossModel route is gone (no $0 output); separate SKU
		// codes both stay and the API takes the cheaper; within one code only
		// the highest version counts ($0.30, not $0.50), and the "requests"
		// meter dropped in v2 does not survive from v1. "moved" went from global
		// (v1) to EU (v2): the current EU price stays, the stale global one goes.
		assert.deepEqual(all["cloudflare/clef-flash"], [
			"1|standard|image_inputs|input|0.03",
			"1|standard|input_tokens|input|0.038",
			"1|standard|input_tokens|input|0.09",
			"1|standard|output_tokens|output|0.3",
			"1|priority|video_inputs|input|0.05",
		].sort());

		// The cheaper coming-soon route is not used while a routable one exists,
		// but prices a preview-only model.
		assert.ok(!all["cloudflare/clef-flash"].some((meter) => meter.endsWith("|0.001")));
		assert.deepEqual(all["acme/preview-only"], ["1|standard|input_tokens|input|0.007"]);
		// Two routes of one provider are separate offers.
		assert.deepEqual(all["acme/two-routes"], [
			"1|standard|input_tokens|input|1",
			"2|standard|output_tokens|output|2",
		]);

		// "tiermove" moved from standard (v1) to priority (v2): a standard-tier
		// request must not bring back v1.
		const standard = await pricing(db, null, "standard");
		assert.ok(!standard["cloudflare/clef-flash"].some((meter) => meter.includes("video_inputs")));
		// Short and long context stay even with different start dates; the EU price is dropped while a global
		// price exists; draft SKUs never appear; other tiers stay for the API.
		// The EU-only audio meter stays: there is no global price for it.
		assert.deepEqual(all["openai/gpt-test"], [
			"1|batch|input_text_tokens|input|1",
			"1|standard|audio_seconds|input|0.001",
			"1|standard|input_text_tokens|input|2",
			"1|standard|input_text_tokens|input|4",
			"1|standard|output_text_tokens|output|10",
			"1|standard|output_text_tokens|output|15",
		]);

		// Provider identities are never part of the pricing rows.
		const raw = await db.query("select jsonb_agg(payload->'pricing_detail_rows')::text as text from public.get_v2_public_models_page_rows_without_lifecycle(null, null) payload");
		assert.ok(!/cloudflare"|crossmodel|"openai"/.test(raw.rows[0].text));

		// A region filter keeps that region's price alongside the global ones.
		// A US request must not bring back the superseded global "moved" v1.
		const us = await pricing(db, "us", null);
		assert.ok(us["cloudflare/clef-flash"].includes("1|standard|input_tokens|input|0.038"));
		assert.ok(!us["cloudflare/clef-flash"].some((meter) => meter.includes("image_inputs")));

		const eu = await pricing(db, "eu", "standard");
		assert.ok(eu["openai/gpt-test"].includes("1|standard|input_text_tokens|input|2.2"));
		// A variant running in the US with EU data storage matches an EU request too.
		assert.ok(eu["openai/gpt-test"].includes("1|standard|input_text_tokens|input|2.6"));
		assert.ok(!eu["openai/gpt-test"].some((meter) => meter.includes("|batch|")));
	} finally {
		await db.close();
	}
});
