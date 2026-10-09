import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeCatalogueTier, normalizeCatalogueTiers } from "./catalogue-tiers";
import { attachModelsPageVariants, buildModelsPageFacets, fetchModelsPageCatalogue } from "./page-catalogue";

afterEach(() => vi.unstubAllGlobals());

describe("catalogue tiers", () => {
	it.each(["fast", "priority", "highspeed"])("round-trips %s across provider aliases in the regional catalogue", async (serviceTier) => {
		const rows = ["priority", "fast", "highspeed", "standard"].map((tier) => ({ model_id: `test/${tier}`, gateway_tiers: [tier] }));
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).includes("get_public_models_page_payload") ? rows : [])));
		vi.stubGlobal("fetch", fetchMock);
		const result = await fetchModelsPageCatalogue({ ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" }, { region: "ca", serviceTier });
		expect(result.models.map((row) => row.model_id)).toEqual(["test/priority", "test/fast", "test/highspeed"]);
		const call = fetchMock.mock.calls.find(([input]) => String(input).includes("get_public_models_page_payload"));
		expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ p_region: "ca", p_service_tier: null });
	});
	it.each(["tier_1", "tier_2", "tier_3", "production", "default", "developer", "auto", "early-access", "model_lab", "private", undefined])("treats %s as Standard service", (tier) => {
		expect(normalizeCatalogueTier(tier)).toBe("standard");
	});
	it("keeps Free available for free models", () => {
		expect(normalizeCatalogueTier("free")).toBe("free");
		expect(buildModelsPageFacets([{ gateway_tiers: ["free"] }]).tierOptions).toEqual([{ value: "free", count: 1 }]);
	});
	it.each(["fast", "priority", "highspeed", " High Speed "])("maps %s to Fast", (tier) => {
		expect(normalizeCatalogueTier(tier)).toBe("fast");
	});
	it("preserves the five service modes and deduplicates aliases", () => {
		expect(normalizeCatalogueTiers(["standard", "default", "flex", "priority", "fast", "batch", "ultrafast"])).toEqual(["standard", "flex", "fast", "batch", "ultrafast"]);
	});
	it("uses matching normalized values in model rows and counts each model once per tier", () => {
		const rows = [{ model_id: "test/model", gateway_tiers: ["tier_2", "production", "priority", "highspeed"] }];
		expect(attachModelsPageVariants(rows)[0].gateway_tiers).toEqual(["standard", "fast"]);
		expect(buildModelsPageFacets(rows).tierOptions).toEqual([{ value: "fast", count: 1 }, { value: "standard", count: 1 }]);
	});
});
