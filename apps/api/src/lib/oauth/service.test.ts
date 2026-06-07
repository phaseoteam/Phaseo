import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearRuntime, configureRuntime } from "@/runtime/env";
import {
	assertRedirectAllowed,
	CLI_DEFAULT_SCOPES,
	createUserCode,
	filterAllowedScopes,
	hashOAuthSecret,
	normalizeScopes,
	normalizeUserCode,
	verifyClientSecret,
} from "./service";

describe("OAuth service helpers", () => {
	beforeAll(() => {
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			KEY_PEPPER_ACTIVE: "test-pepper",
		} as any);
	});

	afterAll(() => {
		clearRuntime();
	});

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

	it("requires a valid secret for confidential OAuth clients", async () => {
		const secret = "super-secret-value";
		const client = {
			client_type: "confidential",
			client_secret_hash: await hashOAuthSecret(secret),
		} as const;

		await expect(verifyClientSecret(client, secret)).resolves.toBe(true);
		await expect(verifyClientSecret(client, "wrong-secret")).resolves.toBe(false);
		await expect(verifyClientSecret(client, null)).resolves.toBe(false);
	});
});
