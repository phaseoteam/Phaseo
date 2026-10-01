import { gatewayMutationMessage } from "./gatewayPublication";

describe("gateway mutation feedback", () => {
	it("preserves successful and legacy responses", () => {
		expect(gatewayMutationMessage("Saved.", { gatewayCacheInvalidated: true })).toBe("Saved.");
		expect(gatewayMutationMessage("Saved.", {})).toBe("Saved.");
	});
	it("reports committed writes separately from publication failure", () => {
		expect(gatewayMutationMessage("Key deleted.", { gatewayCacheInvalidated: false }))
			.toBe("Key deleted; gateway refresh failed. Changes may take longer to apply.");
	});
	it("does not hide an earlier failure behind later successful mutations", () => {
		expect(gatewayMutationMessage("Saved", { gatewayCacheInvalidated: false }, { gatewayCacheInvalidated: true }))
			.toContain("gateway refresh failed");
	});
});
