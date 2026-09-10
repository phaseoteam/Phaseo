import assert from "node:assert/strict";
import { test } from "node:test";
import { excludeStealthRows, filterPublicSnapshotRows } from "./exportSnapshotPrivacy";

test("excludes stealth models and linked rows regardless of table order", () => {
	const snapshots = new Map<string, Record<string, unknown>[]>([
		["v2_models", [{ model_slug: "stealth/preview" }, { model_slug: "public/model", updated_at: null }]],
		["v2_pricing_sku_meters", [{ sku_id: "private-sku" }, { sku_id: "public-sku" }]],
		["v2_model_links", [{ model_slug: "stealth/preview", url: "private-source" }]],
		["v2_pricing_skus", [{ sku_id: "private-sku", provider_model_id: "stealth:opaque" }, { sku_id: "public-sku", provider_model_id: "public:route" }]],
		["v2_model_provider_routes", [{ model_slug: "stealth/preview", provider_model_id: "stealth:opaque", provider_model_slug: "private-upstream", is_stealth: true }, { model_slug: "public/model", provider_model_id: "public:route", is_stealth: false }]],
		["v2_catalogue_source_overrides", [{ source_key: "stealth/preview" }, { source_key: "stealth:opaque" }, { source_key: "retired-private-target", disposition: "stealth" }, { source_key: "public/model" }]],
	]);
	const result = excludeStealthRows(snapshots);
	assert.deepEqual(result.get("v2_models"), [{ model_slug: "public/model", updated_at: null }]);
	assert.deepEqual(result.get("v2_pricing_sku_meters"), [{ sku_id: "public-sku" }]);
	assert.deepEqual(result.get("v2_model_links"), []);
	assert.equal(result.has("v2_catalogue_source_overrides"), false);
	assert.equal(result.get("v2_model_provider_routes")?.length, 1);
	assert.equal(result.get("v2_pricing_skus")?.length, 1);
	assert.deepEqual(excludeStealthRows(new Map([...snapshots].reverse())).get("v2_models"), result.get("v2_models"));
	assert.equal(snapshots.get("v2_models")?.length, 2);
});

test("does not publish private tables, onboarding identities, or unpublished self-serve providers", () => {
	const snapshots = new Map<string, Record<string, unknown>[]>([
		["v2_catalogue_source_overrides", [{ actor_user_id: "user-1", source_key: "private-price" }]],
		["v2_providers", [
			{ provider_slug: "submitted-provider", routable: false, routing_enabled: false, metadata: { self_serve: { last_submitted_by: "user-1" }, website_url: "https://provider.example" } },
			{ provider_slug: "public-provider", routable: true, routing_enabled: true, metadata: { self_serve: { last_submitted_by: "user-2" }, colour: "#fff" } },
		]],
		["v2_model_provider_routes", [{ provider_model_id: "submitted-route", provider_slug: "submitted-provider" }, { provider_model_id: "public-route", provider_slug: "public-provider" }]],
		["v2_pricing_skus", [{ sku_id: "submitted-sku", provider_model_id: "submitted-route" }, { sku_id: "public-sku", provider_model_id: "public-route" }]],
		["v2_pricing_sku_meters", [{ sku_id: "submitted-sku" }, { sku_id: "public-sku" }]],
		["v2_benchmarks", [{ benchmark_id: "internal-evaluation", name: "Internal evaluation" }, { benchmark_id: "mmlu", name: "MMLU" }]],
		["v2_benchmark_results", [
			{ result_id: "internal-result", benchmark_id: "internal-evaluation", other_info: null },
			{ result_id: "private-note", benchmark_id: "mmlu", other_info: "Internal test set" },
			{ result_id: "public-result", benchmark_id: "mmlu", other_info: "Public report" },
		]],
	]);

	const result = filterPublicSnapshotRows(snapshots);
	assert.equal(result.has("v2_catalogue_source_overrides"), false);
	assert.deepEqual(result.get("v2_providers"), [{ provider_slug: "public-provider", routable: true, routing_enabled: true, metadata: { colour: "#fff" } }]);
	assert.deepEqual(result.get("v2_model_provider_routes"), [{ provider_model_id: "public-route", provider_slug: "public-provider" }]);
	assert.deepEqual(result.get("v2_pricing_skus"), [{ sku_id: "public-sku", provider_model_id: "public-route" }]);
	assert.deepEqual(result.get("v2_pricing_sku_meters"), [{ sku_id: "public-sku" }]);
	assert.deepEqual(result.get("v2_benchmarks"), [{ benchmark_id: "mmlu", name: "MMLU" }]);
	assert.deepEqual(result.get("v2_benchmark_results"), [{ result_id: "public-result", benchmark_id: "mmlu", other_info: "Public report" }]);
});

test("removes identity fields recursively while preserving catalog values", () => {
	const snapshots = new Map<string, Record<string, unknown>[]>([["v2_models", [{
		model_slug: "public/model",
		name: "Public model",
		metadata: {
			colour: "#fff",
			owner_user_id: "user-1",
			sources: [{ url: "https://example.com", submitted_by: "user-2" }],
		},
	}]]]);

	assert.deepEqual(filterPublicSnapshotRows(snapshots).get("v2_models"), [{
		model_slug: "public/model",
		name: "Public model",
		metadata: { colour: "#fff", sources: [{ url: "https://example.com" }] },
	}]);
});
