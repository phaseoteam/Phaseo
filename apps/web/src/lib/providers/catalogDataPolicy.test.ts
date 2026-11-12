import { describe, it, expect } from "vitest";
import { currentCatalogDataPolicy } from "./catalogDataPolicy";

describe("cached catalog privacy policy", () => {
	it("expires a previously positive declaration without falling back to the provider default", () => {
		expect(currentCatalogDataPolicy({ catalogManaged: true, validUntil: "2000-01-01T00:00:00Z", zeroDataRetention: true }))
			.toMatchObject({ zeroDataRetention: false, zdrEligibility: "ineligible", tier: "unknown" });
	});
	it("preserves manual guarantees and current declarations", () => {
		const manual = { zeroDataRetention: true };
		expect(currentCatalogDataPolicy(manual)).toBe(manual);
		const current = { catalogManaged: true, validUntil: "2999-01-01T00:00:00Z", zeroDataRetention: true };
		expect(currentCatalogDataPolicy(current)).toBe(current);
	});
});
