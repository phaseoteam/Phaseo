import { describe, expect, it } from "vitest";
import { normalizeCatalogueTier, normalizeCatalogueTiers } from "./catalogue-tiers";
import { attachModelsPageVariants, buildModelsPageFacets } from "./page-catalogue";

describe("catalogue tiers", () => {
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
