import { normalizeGatewayApiBaseUrl } from "./agent-discovery";

describe("normalizeGatewayApiBaseUrl", () => {
	it.each([
		["https://api.phaseo.app", "https://api.phaseo.app/v1"],
		["https://api.phaseo.app/", "https://api.phaseo.app/v1"],
		["https://api.phaseo.app/v1", "https://api.phaseo.app/v1"],
		["https://api.phaseo.app/v1/", "https://api.phaseo.app/v1"],
	])("normalizes %s to the versioned API base", (input, expected) => {
		expect(normalizeGatewayApiBaseUrl(input)).toBe(expected);
	});
});
