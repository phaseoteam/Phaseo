import {
	buildStartSsoRequest,
	deriveDomainFromWorkEmailOrDomain,
	mapSsoAuthErrorMessage,
} from "./sso";

describe("sso helpers", () => {
	it("maps SAML providerId inputs to signInWithSSO payloads", () => {
		expect(
			buildStartSsoRequest(
				{ mode: "saml", providerId: "provider-uuid" },
				"https://example.com/auth/callback",
			),
		).toEqual({
			kind: "sso",
			params: {
				providerId: "provider-uuid",
				options: { redirectTo: "https://example.com/auth/callback" },
			},
		});
	});

	it("maps SAML domain inputs to signInWithSSO payloads", () => {
		expect(
			buildStartSsoRequest(
				{ mode: "saml", domain: "dev@company.com" },
				"https://example.com/auth/callback",
			),
		).toEqual({
			kind: "sso",
			params: {
				domain: "company.com",
				options: { redirectTo: "https://example.com/auth/callback" },
			},
		});
	});

	it("maps custom OIDC inputs to signInWithOAuth payloads", () => {
		expect(
			buildStartSsoRequest(
				{ mode: "custom_oidc", provider: "custom:okta-main" },
				"https://example.com/auth/callback",
			),
		).toEqual({
			kind: "oauth",
			params: {
				provider: "custom:okta-main",
				options: { redirectTo: "https://example.com/auth/callback" },
			},
		});
	});

	it("maps disabled provider errors to user-facing copy", () => {
		expect(
			mapSsoAuthErrorMessage({
				code: "saml_provider_disabled",
				message: "provider disabled",
			}),
		).toBe("Enterprise SSO is configured but currently disabled.");
	});

	it("derives domains from work email inputs", () => {
		expect(deriveDomainFromWorkEmailOrDomain("team@Example.com")).toBe(
			"example.com",
		);
	});
});
