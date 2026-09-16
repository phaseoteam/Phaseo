import { excludeStealthRows, filterPublicSnapshotRows } from "./exportSnapshotPrivacy";

test("redacts metadata references and rejects private descriptive text without printing values", () => {
	const input = new Map<string, Record<string, unknown>[]>([["v2_models", [
		{ model_slug: "hidden/base", hidden: true },
		{ model_slug: "public/model", metadata: { note: "See hidden/base for details" } },
	]]]);
	expect(filterPublicSnapshotRows(input).get("v2_models")![0].metadata).toEqual({});
	input.get("v2_models")![1].metadata = { legacy_model_id: "hidden/base-dated-public-variant" };
	expect(filterPublicSnapshotRows(input).get("v2_models")).toHaveLength(1);
	input.get("v2_models")![1].metadata = { legacy_model_id: "hidden/base" };
	expect(filterPublicSnapshotRows(input).get("v2_models")![0].metadata).toEqual({});
	input.get("v2_models")![1].description = "See hidden/base for details";
	expect(() => filterPublicSnapshotRows(input)).toThrow("private catalog reference in v2_models.description");
});

test("redacts links from a public model to hidden model versions", () => {
	const result = filterPublicSnapshotRows(new Map<string, Record<string, unknown>[]>([["v2_models", [
		{ model_slug: "secret/model", hidden: true },
		{ model_slug: "public/model", previous_model_slug: "secret/model", base_model_slug: "secret/model" },
	]]]));
	expect(result.get("v2_models")).toEqual([{ model_slug: "public/model", previous_model_slug: null, base_model_slug: null }]);
});

test("does not export labs and families used only by hidden models", () => {
	const result = filterPublicSnapshotRows(new Map<string, Record<string, unknown>[]>([
		["v2_models", [{ model_slug: "secret/model", hidden: true, lab_slug: "secret-lab", family_slug: "secret-family" }]],
		["v2_labs", [{ lab_slug: "secret-lab" }, { lab_slug: "public-lab" }]],
		["v2_lab_links", [{ lab_slug: "secret-lab", url: "https://secret.example" }]],
		["v2_model_families", [{ family_slug: "secret-family" }]],
	]));
	expect(result.get("v2_labs")).toEqual([{ lab_slug: "public-lab" }]);
	expect(result.get("v2_lab_links")).toEqual([]);
	expect(result.get("v2_model_families")).toEqual([]);
});

test("excludes unreleased support on public providers and all opaque descendants", () => {
	const now = Date.parse("2026-09-12T12:00:00Z");
	const snapshots = new Map<string, Record<string, unknown>[]>([
		["v2_models", [{ model_slug: "public/model" }, { model_slug: "hidden/model", hidden: true }]],
		["v2_providers", [{ provider_slug: "public", routable: true, routing_enabled: true }]],
		["v2_model_provider_routes", [
			{ provider_model_id: "visible", model_slug: "public/model", provider_slug: "public", access_scope: "public" },
			{ provider_model_id: "internal", model_slug: "public/model", provider_slug: "public", access_scope: "internal" },
			{ provider_model_id: "future", model_slug: "public/model", effective_from: "2026-09-13T00:00:00Z" },
			{ provider_model_id: "unready", model_slug: "public/model", provider_availability_status: "not_ready" },
			{ provider_model_id: "hidden", model_slug: "hidden/model" },
			{ provider_model_id: "missing-parent", model_slug: "unknown/model" },
		]],
		["v2_route_capabilities", ["visible", "internal", "hidden", "future", "unready", "missing-parent"].map((id) => ({ provider_model_id: id }))],
		["v2_route_variants", [{ variant_id: "private-variant", provider_model_id: "hidden" }]],
		["v2_pricing_skus", [{ sku_id: "indirect", route_variant_id: "private-variant" }, { sku_id: "orphan", provider_model_id: "missing-parent" }]],
		["v2_pricing_sku_meters", [{ sku_id: "indirect" }, { sku_id: "orphan" }]],
		["provider_catalog_models", [{ name: "must never leave database" }]],
	]);
	const result = filterPublicSnapshotRows(snapshots, now);
	expect(result.get("v2_model_provider_routes")).toEqual([snapshots.get("v2_model_provider_routes")![0]]);
	expect(result.get("v2_route_capabilities")).toEqual([{ provider_model_id: "visible" }]);
	expect(result.get("v2_route_variants")).toEqual([]);
	expect(result.get("v2_pricing_skus")).toEqual([]);
	expect(result.get("v2_pricing_sku_meters")).toEqual([]);
	expect(result.has("provider_catalog_models")).toBe(false);
});

test("stealth suppression cascades through other routes for the same model", () => {
	const result = filterPublicSnapshotRows(new Map([
		["v2_models", [{ model_slug: "secret/model" }]],
		["v2_model_provider_routes", [
			{ model_slug: "secret/model", provider_model_id: "stealth", is_stealth: true },
			{ model_slug: "secret/model", provider_model_id: "other" },
		]],
		["v2_pricing_skus", [{ sku_id: "opaque", provider_model_id: "other" }]],
		["v2_pricing_sku_meters", [{ sku_id: "opaque" }]],
	] as [string, Record<string, unknown>[]][]));
	expect([...result.values()].flat()).toEqual([]);
});

test("release cutoff is exact and invalid timestamps fail closed", () => {
	const rows = [{ provider_model_id: "due", effective_from: "2026-09-12T12:00:00Z" }, { provider_model_id: "invalid", effective_from: "invalid" }];
	const snapshot = new Map([["v2_model_provider_routes", rows]]);
	expect(filterPublicSnapshotRows(snapshot, Date.parse("2026-09-12T11:59:59.999Z")).get("v2_model_provider_routes")).toEqual([]);
	expect(filterPublicSnapshotRows(snapshot, Date.parse("2026-09-12T12:00:00Z")).get("v2_model_provider_routes")).toEqual([rows[0]]);
});

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
	expect(result.get("v2_models")).toEqual([{ model_slug: "public/model", updated_at: null }]);
	expect(result.get("v2_pricing_sku_meters")).toEqual([{ sku_id: "public-sku" }]);
	expect(result.get("v2_model_links")).toEqual([]);
	expect(result.has("v2_catalogue_source_overrides")).toBe(false);
	expect(result.get("v2_model_provider_routes")).toHaveLength(1);
	expect(result.get("v2_pricing_skus")).toHaveLength(1);
	expect(excludeStealthRows(new Map([...snapshots].reverse())).get("v2_models")).toEqual(result.get("v2_models"));
	expect(snapshots.get("v2_models")).toHaveLength(2);
});

test("does not publish private tables, onboarding identities, or unpublished self-serve providers", () => {
	const snapshots = new Map<string, Record<string, unknown>[]>([
		["v2_catalogue_source_overrides", [{ actor_user_id: "user-1", source_key: "private-price" }]],
		["v2_providers", [
			{ provider_slug: "submitted-provider", routable: false, routing_enabled: false, metadata: { self_serve: { last_submitted_by: "user-1" }, website_url: "https://provider.example" } },
			{ provider_slug: "partially-published-provider", routable: true, routing_enabled: false, metadata: { self_serve: { last_submitted_by: "user-3" } } },
			{ provider_slug: "public-provider", routable: true, routing_enabled: true, metadata: { self_serve: { last_submitted_by: "user-2" }, colour: "#fff" } },
		]],
		["v2_model_provider_routes", [
			{ provider_model_id: "submitted-route", provider_slug: "submitted-provider" },
			{ provider_model_id: "partially-published-route", provider_slug: "partially-published-provider" },
			{ provider_model_id: "public-route", provider_slug: "public-provider" },
		]],
		["v2_pricing_skus", [
			{ sku_id: "submitted-sku", provider_model_id: "submitted-route" },
			{ sku_id: "partially-published-sku", provider_model_id: "partially-published-route" },
			{ sku_id: "public-sku", provider_model_id: "public-route" },
		]],
		["v2_pricing_sku_meters", [{ sku_id: "submitted-sku" }, { sku_id: "partially-published-sku" }, { sku_id: "public-sku" }]],
		["v2_benchmarks", [{ benchmark_id: "opaque-internal-evaluation", name: "Internal evaluation" }, { benchmark_id: "mmlu", name: "MMLU" }]],
		["v2_benchmark_results", [
			{ result_id: "internal-result", benchmark_id: "opaque-internal-evaluation", other_info: null },
			{ result_id: "private-note", benchmark_id: "mmlu", other_info: "Internal test set" },
			{ result_id: "public-result", benchmark_id: "mmlu", other_info: "Public report" },
		]],
	]);

	const result = filterPublicSnapshotRows(snapshots);
	expect(result.has("v2_catalogue_source_overrides")).toBe(false);
	expect(result.get("v2_providers")).toEqual([{ provider_slug: "public-provider", routable: true, routing_enabled: true, metadata: { colour: "#fff" } }]);
	expect(result.get("v2_model_provider_routes")).toEqual([{ provider_model_id: "public-route", provider_slug: "public-provider" }]);
	expect(result.get("v2_pricing_skus")).toEqual([{ sku_id: "public-sku", provider_model_id: "public-route" }]);
	expect(result.get("v2_pricing_sku_meters")).toEqual([{ sku_id: "public-sku" }]);
	expect(result.get("v2_benchmarks")).toEqual([{ benchmark_id: "mmlu", name: "MMLU" }]);
	expect(result.get("v2_benchmark_results")).toEqual([{ result_id: "public-result", benchmark_id: "mmlu", other_info: "Public report" }]);
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

	expect(filterPublicSnapshotRows(snapshots).get("v2_models")).toEqual([{
		model_slug: "public/model",
		name: "Public model",
		metadata: { colour: "#fff", sources: [{ url: "https://example.com" }] },
	}]);
});
