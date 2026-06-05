import { describe, expect, it } from "vitest";
import {
	assertRedirectAllowed,
	CLI_DEFAULT_SCOPES,
	createUserCode,
	filterAllowedScopes,
	normalizeScopes,
	normalizeUserCode,
} from "./service";

describe("OAuth service helpers", () => {
	it("normalizes scope strings and user codes", () => {
		expect(normalizeScopes("openid profile  keys:write")).toEqual([
			"openid",
			"profile",
			"keys:write",
		]);
		expect(normalizeUserCode("abcd efgh")).toBe("ABCD-EFGH");
	});

	it("filters requested scopes against client allowlists", () => {
		const client = {
			allowed_scopes: ["openid", "keys:write"],
		} as any;
		expect(filterAllowedScopes(client, ["openid", "profile", "keys:write"])).toEqual([
			"openid",
			"keys:write",
		]);
	});

	it("allows first-party CLI loopback redirects for PKCE login", () => {
		const cliClient = {
			id: "aistats_cli",
			redirect_uris: [],
		} as any;
		const thirdPartyClient = {
			id: "other_client",
			redirect_uris: [],
		} as any;

		expect(assertRedirectAllowed(cliClient, "http://127.0.0.1:8976/callback")).toBe(true);
		expect(assertRedirectAllowed(cliClient, "http://localhost:8976/callback")).toBe(true);
		expect(assertRedirectAllowed(cliClient, "https://localhost:8976/callback")).toBe(false);
		expect(assertRedirectAllowed(thirdPartyClient, "http://127.0.0.1:8976/callback")).toBe(false);
	});

	it("grants the first-party CLI full control-plane capability coverage by default", () => {
		expect(CLI_DEFAULT_SCOPES).toContain("keys:write");
		expect(CLI_DEFAULT_SCOPES).toContain("keys:delete");
		expect(CLI_DEFAULT_SCOPES).toContain("workspaces:write");
		expect(CLI_DEFAULT_SCOPES).toContain("presets:write");
		expect(CLI_DEFAULT_SCOPES).toContain("guardrails:write");
		expect(CLI_DEFAULT_SCOPES).toContain("management_keys:write");
		expect(CLI_DEFAULT_SCOPES).toContain("oauth_clients:write");
	});

	it("generates user codes in the expected format and alphabet", () => {
		for (let i = 0; i < 32; i++) {
			expect(createUserCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
		}
	});
});
