import assert from "node:assert/strict";
import { test } from "node:test";
import { excludeStealthRows } from "./exportSnapshotPrivacy";

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
	assert.deepEqual(result.get("v2_catalogue_source_overrides"), [{ source_key: "public/model" }]);
	assert.equal(result.get("v2_model_provider_routes")?.length, 1);
	assert.equal(result.get("v2_pricing_skus")?.length, 1);
	assert.deepEqual(excludeStealthRows(new Map([...snapshots].reverse())).get("v2_models"), result.get("v2_models"));
	assert.equal(snapshots.get("v2_models")?.length, 2);
});
