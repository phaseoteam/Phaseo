import { resolveDefaultGatewayStatuses } from "./defaultGatewayStatuses";

describe("resolveDefaultGatewayStatuses", () => {
	it("shows active and coming-soon Gateway models by default", () => {
		expect(resolveDefaultGatewayStatuses([], false)).toEqual([
			"active",
			"coming_soon",
		]);
	});

	it("preserves an explicit status selection", () => {
		expect(resolveDefaultGatewayStatuses(["coming_soon"], true)).toEqual([
			"coming_soon",
		]);
	});

	it("allows all statuses after the user explicitly clears the filter", () => {
		expect(resolveDefaultGatewayStatuses([], true)).toEqual([]);
	});
});
