import { describe, it, expect } from "vitest";
import { resolveModelVisibility } from "./modelVisibility";

describe("resolveModelVisibility", () => {
	it("marks hidden models as internal, even when they have private routes", () => {
		expect(resolveModelVisibility({ hidden: true })).toBe("internal");
		expect(resolveModelVisibility({ hidden: true, gateway_tiers: ["private"] })).toBe("internal");
	});

	it("marks models served only through private endpoints as private", () => {
		expect(resolveModelVisibility({ gateway_tiers: ["private"] })).toBe("private");
		expect(resolveModelVisibility({ is_private: true })).toBe("private");
	});

	it("does not mark public models, including ones with an extra private route", () => {
		expect(resolveModelVisibility({})).toBeNull();
		expect(resolveModelVisibility({ hidden: false, gateway_tiers: [] })).toBeNull();
		expect(resolveModelVisibility({ gateway_tiers: ["standard", "private"] })).toBeNull();
	});
});
