import {
	normalizeSsoDomains,
	normalizeTeamSsoSettingsInput,
} from "./teamSsoSettings";

describe("team SSO settings helpers", () => {
	it("normalizes and deduplicates domain values", () => {
		expect(
			normalizeSsoDomains([
				" Example.com ",
				"example.com",
				"invalid_domain",
				"dept.example.org",
			]),
		).toEqual(["example.com", "dept.example.org"]);
	});

	it("forces enforcement off when SSO is disabled", () => {
		expect(
			normalizeTeamSsoSettingsInput({
				ssoEnabled: false,
				ssoEnforced: true,
				ssoMode: "saml",
				ssoProviderIdentifier: "provider-id",
				ssoDomains: ["company.com"],
			}),
		).toEqual({
			ssoEnabled: false,
			ssoEnforced: false,
			ssoMode: "saml",
			ssoProviderIdentifier: "provider-id",
			ssoDomains: ["company.com"],
		});
	});

	it("rejects custom oidc provider identifiers without custom prefix", () => {
		expect(() =>
			normalizeTeamSsoSettingsInput({
				ssoEnabled: true,
				ssoEnforced: false,
				ssoMode: "custom_oidc",
				ssoProviderIdentifier: "okta-main",
				ssoDomains: ["company.com"],
			}),
		).toThrow("Custom OIDC provider identifiers must start with `custom:`.");
	});

	it("clears provider identifier when mode is none", () => {
		expect(
			normalizeTeamSsoSettingsInput({
				ssoEnabled: true,
				ssoEnforced: true,
				ssoMode: "none",
				ssoProviderIdentifier: "custom:okta-main",
				ssoDomains: ["company.com"],
			}),
		).toEqual({
			ssoEnabled: true,
			ssoEnforced: true,
			ssoMode: "none",
			ssoProviderIdentifier: null,
			ssoDomains: ["company.com"],
		});
	});
});
