import { describe, expect, it } from "vitest";
import sampleCatalog from "./fixtures/provider-catalog-v1.json";
import { normalizeProviderCatalog } from "./provider-catalog";
import { reconcileProviderCatalogClaims } from "./provider-catalog-reconciliation";

function catalogClient(visibleModelIds: string[]) {
	const writes: Array<{ table: string; action: string; value: unknown }> = [];
	const client = {
		from(table: string) {
			let action = "select";
			const builder = {
				select() { return builder; },
				in() { return builder; },
				eq() { return builder; },
				or() { return builder; },
				update(value: unknown) { action = "update"; writes.push({ table, action, value }); return builder; },
				upsert(value: unknown) { writes.push({ table, action: "upsert", value }); return Promise.resolve({ error: null }); },
				then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
					const data = action === "select" && table === "v2_models"
						? visibleModelIds.map((model_slug) => ({ model_slug }))
						: [];
					return Promise.resolve(resolve({ data, error: null }));
				},
			};
			return builder;
		},
	};
	return { client, writes };
}

describe("provider catalog reconciliation", () => {
	it("keeps a hidden canonical model in review, without staging a public route", async () => {
		const { client, writes } = catalogClient([]);
		const model = normalizeProviderCatalog(sampleCatalog).allModels[0];
		const result = await reconcileProviderCatalogClaims(client, { providerSlug: "sample", runId: "run-1", models: [model] });
		expect(result).toEqual({ approved: 0, pending: 1, reviewStatus: "pending" });
		expect(writes.some((write) => write.table === "provider_catalog_route_candidates")).toBe(false);
		expect(writes.find((write) => write.table === "provider_catalog_sync_models")?.value).toMatchObject({
			canonical_model_slug: null, decision: "pending", route_projection_status: "not_projected",
		});
	});

	it("stages an existing visible model with exact parameters and effective prices", async () => {
		const { client, writes } = catalogClient(["sample/atlas-1"]);
		const model = normalizeProviderCatalog(sampleCatalog).allModels[0];
		const result = await reconcileProviderCatalogClaims(client, { providerSlug: "sample", runId: "run-1", models: [model] });
		expect(result).toEqual({ approved: 1, pending: 0, reviewStatus: "approved" });
		expect(writes.find((write) => write.table === "provider_catalog_route_candidates")?.value).toMatchObject({
			canonical_model_slug: "sample/atlas-1",
			capabilities: [{ id: "responses", parameters: ["temperature", "max_output_tokens"] }],
			pricing: [{ meterKey: "input_tokens", priceNanos: 250_000_000 }, { meterKey: "output_tokens", priceNanos: 750_000_000 }],
		});
	});
});
