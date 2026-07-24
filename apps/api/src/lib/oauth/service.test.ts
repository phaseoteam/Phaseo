import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearRuntime, configureRuntime } from "@/runtime/env";
import {
	assertRedirectAllowed,
	CLI_DEFAULT_SCOPES,
	createUserCode,
	filterAllowedScopes,
	hashOAuthClientSecret,
	hashOAuthSecret,
	normalizeScopes,
	normalizeUserCode,
	verifyPkce,
	verifyClientSecret,
} from "./service";

const baseBindings = {
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
	GATEWAY_CACHE: {} as KVNamespace,
	KEY_PEPPER_ACTIVE: "test-key-pepper",
	PHASEO_OAUTH_TOKEN_PEPPER_ACTIVE: "test-oauth-pepper",
};

function replaceRuntime(bindings: Record<string, unknown>) {
	clearRuntime();
	configureRuntime(bindings as any);
}

describe("OAuth service helpers", () => {
	beforeAll(() => {
		configureRuntime(baseBindings as any);
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

	it("enforces RFC 7636 verifier and challenge syntax", async () => {
		const verifier = "A".repeat(43);
		const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
		let binary = "";
		for (const byte of digest) binary += String.fromCharCode(byte);
		const challenge = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

		await expect(verifyPkce({ codeVerifier: verifier, codeChallenge: challenge, method: "S256" })).resolves.toBe(true);
		await expect(verifyPkce({ codeVerifier: "short", codeChallenge: challenge, method: "S256" })).resolves.toBe(false);
		await expect(verifyPkce({ codeVerifier: verifier, codeChallenge: "short", method: "S256" })).resolves.toBe(false);
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

	it("treats an empty OAuth client scope allowlist as deny-all", () => {
		const client = {
			allowed_scopes: [],
		} as any;
		expect(filterAllowedScopes(client, ["openid", "keys:write"])).toEqual([]);
	});

	it("allows first-party CLI loopback redirects for PKCE login", () => {
		const cliClient = {
			id: "phaseo_cli",
			redirect_uris: [],
		} as any;
		const legacyCliClient = {
			id: "aistats_cli",
			redirect_uris: [],
		} as any;
		const thirdPartyClient = {
			id: "other_client",
			redirect_uris: [],
		} as any;

		expect(assertRedirectAllowed(cliClient, "http://127.0.0.1:8976/callback")).toBe(true);
		expect(assertRedirectAllowed(cliClient, "http://localhost:8976/callback")).toBe(true);
		expect(assertRedirectAllowed(cliClient, "http://[::1]:8976/callback")).toBe(true);
		expect(assertRedirectAllowed(legacyCliClient, "http://127.0.0.1:8976/callback")).toBe(true);
		expect(assertRedirectAllowed(cliClient, "https://localhost:8976/callback")).toBe(false);
		expect(assertRedirectAllowed(cliClient, "http://127.0.0.1:8976/callback?next=evil")).toBe(false);
		expect(assertRedirectAllowed(cliClient, "http://user:pass@127.0.0.1:8976/callback")).toBe(false);
		expect(assertRedirectAllowed(cliClient, "http://127.0.0.1:8976/callback#fragment")).toBe(false);
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

	it("hashes generated OAuth client secrets with the OAuth pepper", async () => {
		const secret = "generated-opaque-client-secret";
		const hash = await hashOAuthClientSecret(secret);
		expect(hash).toBe(await hashOAuthSecret(secret));
		await expect(verifyClientSecret({
			client_type: "confidential",
			client_secret_hash: hash,
		}, secret)).resolves.toBe(true);
	});

	it("keeps OAuth hashes independent from API-key pepper rotation", async () => {
		replaceRuntime({ ...baseBindings, KEY_PEPPER_ACTIVE: "first-key-pepper" });
		const before = await hashOAuthSecret("opaque-token");
		replaceRuntime({ ...baseBindings, KEY_PEPPER_ACTIVE: "rotated-key-pepper" });
		const after = await hashOAuthSecret("opaque-token");
		expect(after).toBe(before);
		replaceRuntime(baseBindings);
	});

	it("accepts OAuth secrets hashed with the previous OAuth pepper", async () => {
		replaceRuntime({ ...baseBindings, PHASEO_OAUTH_TOKEN_PEPPER_ACTIVE: "previous-oauth-pepper" });
		const previousHash = await hashOAuthSecret("confidential-secret");
		replaceRuntime({
			...baseBindings,
			PHASEO_OAUTH_TOKEN_PEPPER_ACTIVE: "active-oauth-pepper",
			PHASEO_OAUTH_TOKEN_PEPPER_PREVIOUS: "previous-oauth-pepper",
		});
		await expect(verifyClientSecret({
			client_type: "confidential",
			client_secret_hash: previousHash,
		}, "confidential-secret")).resolves.toBe(true);
		expect(await hashOAuthSecret("confidential-secret")).not.toBe(previousHash);
		replaceRuntime(baseBindings);
	});

	it("fails closed when the dedicated OAuth active pepper is missing", async () => {
		replaceRuntime({
			...baseBindings,
			PHASEO_OAUTH_TOKEN_PEPPER_ACTIVE: undefined,
		});
		await expect(hashOAuthSecret("opaque-token")).rejects.toThrow("PHASEO_OAUTH_TOKEN_PEPPER_ACTIVE is not configured");
		replaceRuntime(baseBindings);
	});
});
