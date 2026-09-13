import { describe, expect, it } from "vitest";
import { providerMatchesCatalogueRegion } from "./models.catalogue";

describe("regional model catalogue filtering", () => {
	it("requires both execution and data regions to match", () => {
		expect(providerMatchesCatalogueRegion({
			execution_regions: ["eu"],
			data_regions: ["eu"],
		}, "eu")).toBe(true);
		expect(providerMatchesCatalogueRegion({
			execution_regions: ["eu"],
			data_regions: ["us"],
		}, "eu")).toBe(false);
		expect(providerMatchesCatalogueRegion({
			execution_regions: [],
			data_regions: [],
		}, "us")).toBe(false);
	});
});
