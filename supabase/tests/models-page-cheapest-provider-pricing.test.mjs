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
		sku_id uuid primary key default gen_random_uuid(), provider_model_id text, sku_code text, operation text default 'inference',
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
	insert into public.v2_model_provider_routes (provider_model_id, model_slug, provider_slug, status, routing_enabled) values
		('cf:clef-flash', 'cloudflare/clef-flash', 'cloudflare', 'active', true),
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
		('20000000-0000-0000-0000-000000000002', 'openai:gpt-test', 'standard-long', now() - interval '5 days', '00000000-0000-0000-0000-000000000002', 'standard', 'active'),
		('20000000-0000-0000-0000-000000000003', 'openai:gpt-test', 'eu', now() - interval '5 days', '00000000-0000-0000-0000-000000000003', 'standard', 'active'),
		('20000000-0000-0000-0000-000000000004', 'openai:gpt-test', 'batch', now() - interval '5 days', '00000000-0000-0000-0000-000000000004', 'batch', 'active'),
		('20000000-0000-0000-0000-000000000005', 'openai:gpt-test', 'draft', now() - interval '1 days', '00000000-0000-0000-0000-000000000002', 'standard', 'draft'),
		('20000000-0000-0000-0000-000000000006', 'openai:gpt-test', 'hidden-variant', now() - interval '5 days', '00000000-0000-0000-0000-000000000005', 'priority', 'active');

	insert into public.v2_pricing_sku_meters (sku_id, meter_key, direction, price_nanos, display_label) values
		('10000000-0000-0000-0000-000000000001', 'input_tokens', 'input', 90000000, 'Input Tokens'),
		('10000000-0000-0000-0000-000000000002', 'input_tokens', 'input', 38000000, 'Input Tokens'),
		('10000000-0000-0000-0000-000000000003', 'input_tokens', 'input', 90000000, 'Input Tokens'),
		('10000000-0000-0000-0000-000000000003', 'output_tokens', 'output', 0, 'Output Tokens'),
		('20000000-0000-0000-0000-000000000001', 'input_text_tokens', 'input', 2000000000, 'Input Text Tokens'),
		('20000000-0000-0000-0000-000000000001', 'output_text_tokens', 'output', 10000000000, 'Output Text Tokens'),
		('20000000-0000-0000-0000-000000000002', 'input_text_tokens', 'input', 4000000000, 'Input Text Tokens'),
		('20000000-0000-0000-0000-000000000002', 'output_text_tokens', 'output', 15000000000, 'Output Text Tokens'),
		('20000000-0000-0000-0000-000000000003', 'input_text_tokens', 'input', 2200000000, 'Input Text Tokens'),
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
		// The superseded $0.09 SKU and the disabled CrossModel route are gone.
		assert.deepEqual(all["cloudflare/clef-flash"], ["1|standard|input_tokens|input|0.038"]);
		// Short and long context stay; the EU price is dropped while a global
		// price exists; draft SKUs never appear; other tiers stay for the API.
		assert.deepEqual(all["openai/gpt-test"], [
			"1|batch|input_text_tokens|input|1",
			"1|standard|input_text_tokens|input|2",
			"1|standard|input_text_tokens|input|4",
			"1|standard|output_text_tokens|output|10",
			"1|standard|output_text_tokens|output|15",
		]);

		// Provider identities are never part of the pricing rows.
		const raw = await db.query("select jsonb_agg(payload->'pricing_detail_rows')::text as text from public.get_v2_public_models_page_rows_without_lifecycle(null, null) payload");
		assert.ok(!/cloudflare"|crossmodel|"openai"/.test(raw.rows[0].text));

		// A region filter keeps that region's price alongside the global ones.
		const eu = await pricing(db, "eu", "standard");
		assert.ok(eu["openai/gpt-test"].includes("1|standard|input_text_tokens|input|2.2"));
		assert.ok(!eu["openai/gpt-test"].some((meter) => meter.includes("|batch|")));
	} finally {
		await db.close();
	}
});
