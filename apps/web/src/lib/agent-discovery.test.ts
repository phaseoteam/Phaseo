import {
	buildOAuthAuthorizationServerMetadata,
	buildOAuthProtectedResourceMetadata,
	normalizeGatewayApiBaseUrl,
} from "./agent-discovery";

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

describe("Phaseo OAuth discovery", () => {
	it("advertises the API-owned authorization server and dynamic registration", () => {
		expect(buildOAuthAuthorizationServerMetadata()).toMatchObject({
			issuer: "https://api.phaseo.app/oauth",
			authorization_endpoint: "https://api.phaseo.app/oauth/authorize",
			token_endpoint: "https://api.phaseo.app/oauth/token",
			registration_endpoint: "https://api.phaseo.app/oauth/register",
			code_challenge_methods_supported: ["S256"],
		});
	});

	it("points protected resources at the same authorization server", () => {
		expect(buildOAuthProtectedResourceMetadata()).toMatchObject({
			resource: "https://api.phaseo.app/v1",
			authorization_servers: ["https://api.phaseo.app/oauth"],
		});
	});
});
