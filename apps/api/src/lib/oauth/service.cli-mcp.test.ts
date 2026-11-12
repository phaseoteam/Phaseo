import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearRuntime, configureRuntime } from "@/runtime/env";
import {
	issueCliMcpAccessToken,
	issueMcpUpstreamToken,
	validateCliMcpAccessToken,
	validateLocalAccessToken,
} from "./service";

const MCP = "https://mcp.phaseo.app/mcp";
const input = { userId: "user_1", workspaceId: "ws_1", clientId: "phaseo_cli", scopes: ["models:read", "pricing:read"] };

// Real signing with the dev key: the two token kinds must never stand in for each other.
describe("`phaseo mcp` access tokens", () => {
	beforeAll(() => {
		clearRuntime();
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			KEY_PEPPER_ACTIVE: "test-key-pepper",
			PHASEO_OAUTH_TOKEN_PEPPER_ACTIVE: "test-oauth-pepper",
		} as any);
	});
	afterAll(() => clearRuntime());

	it("is accepted only as an MCP token, never by the API", async () => {
		const token = await issueCliMcpAccessToken({ ...input, resource: MCP });
		expect(token).toMatchObject({ token_type: "Bearer", expires_in: 900, scope: "models:read pricing:read", resource: MCP });
		expect(token).not.toHaveProperty("refresh_token");

		expect((await validateLocalAccessToken(token.access_token)).valid).toBe(false);
		expect(await validateCliMcpAccessToken(token.access_token, MCP)).toMatchObject({ client_id: "phaseo_cli", aud: MCP });
		expect(await validateCliMcpAccessToken(token.access_token, "https://evil.example/mcp")).toBeNull();
	});

	it("never accepts an API token, or a token from another client, as an MCP token", async () => {
		const apiToken = await issueMcpUpstreamToken(input);
		expect((await validateLocalAccessToken(apiToken.access_token)).valid).toBe(true);
		expect(await validateCliMcpAccessToken(apiToken.access_token, MCP)).toBeNull();
		expect(await validateCliMcpAccessToken(apiToken.access_token, "phaseo-api")).toBeNull();

		const desktop = await issueCliMcpAccessToken({ ...input, clientId: "phaseo_desktop", resource: MCP });
		expect(await validateCliMcpAccessToken(desktop.access_token, MCP)).toBeNull();
	});

	it("rejects a tampered token", async () => {
		const token = await issueCliMcpAccessToken({ ...input, resource: MCP });
		const [header, payload, signature] = token.access_token.split(".");
		const claims = JSON.parse(atob(payload!.replace(/-/g, "+").replace(/_/g, "/")));
		const widened = btoa(JSON.stringify({ ...claims, scope: "keys:write" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
		expect(await validateCliMcpAccessToken(`${header}.${widened}.${signature}`, MCP)).toBeNull();
	});
});
