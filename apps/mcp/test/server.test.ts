import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("agents/mcp", () => ({ createMcpHandler: vi.fn() }));

let worker: typeof import("../src/index").default;
let createServer: typeof import("../src/index").createServer;

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
	PHASEO_MCP_WRITE_TOOLS_ENABLED: "false",
	PHASEO_MCP_RESOURCE_SERVER_SECRET: "s".repeat(64),
};

const connectedClients: Client[] = [];

beforeAll(async () => {
	({ default: worker, createServer } = await import("../src/index"));
});

afterEach(async () => {
	await Promise.all(connectedClients.splice(0).map((client) => client.close()));
	vi.unstubAllGlobals();
});

describe("Phaseo MCP server metadata", () => {
	it("advertises least-privilege OAuth scopes and exact output schemas", async () => {
		const server = createServer(env, {
			accessToken: "upstream-token",
			workspaceId: "workspace_1",
			scopes: [
				"me:read", "models:read", "providers:read", "pricing:read", "credits:read",
				"activity:read", "analytics:read", "generations:read", "workspaces:read",
				"keys:read", "presets:read", "settings:read", "guardrails:read",
				"management_keys:read", "oauth_clients:read",
			],
		});
		const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
		connectedClients.push(client);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		const result = await client.listTools();
		const tools = Object.fromEntries(result.tools.map((tool) => [tool.name, tool]));

		expect(Object.keys(tools)).toEqual([
			"models_list",
			"model_get",
			"pricing_calculate",
			"providers_list",
			"cost_estimate",
			"api_keys_list",
			"account_get",
			"organisations_list",
			"endpoints_list",
			"pricing_models_list",
			"credits_get",
			"activity_list",
			"analytics_get",
			"generation_get",
			"logs_list",
			"log_get",
			"workspaces_list",
			"workspace_get",
			"workspace_members_list",
			"api_key_get",
			"presets_list",
			"preset_get",
			"settings_get",
			"guardrails_list",
			"guardrail_get",
			"guardrail_keys_list",
			"guardrail_members_list",
			"management_keys_list",
			"management_key_get",
			"oauth_clients_list",
			"oauth_client_get",
			"webhook_endpoints_list",
			"webhook_endpoint_get",
		]);
		expect(tools.models_list?.outputSchema).toMatchObject({
			type: "object",
			properties: { models: { type: "array" } },
			required: ["models"],
		});
		expect(tools.models_list?._meta?.securitySchemes).toEqual([
			{ type: "oauth2", scopes: ["models:read", "pricing:read"] },
		]);
		expect(tools.api_keys_list?._meta?.securitySchemes).toEqual([
			{ type: "oauth2", scopes: ["keys:read"] },
		]);
		expect(tools.api_key_create).toBeUndefined();
	});

	it("keeps the write tool behind both the feature flag and write scope", async () => {
		const server = createServer({ ...env, PHASEO_MCP_WRITE_TOOLS_ENABLED: "true" }, {
			accessToken: "upstream-token",
			workspaceId: "workspace_1",
			scopes: ["keys:write"],
		});
		const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
		connectedClients.push(client);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		const tools = (await client.listTools()).tools;
		expect(tools.map(({ name }) => name)).toEqual(["api_key_create"]);
		const tool = tools.find(({ name }) => name === "api_key_create");
		expect(tool?.annotations).toMatchObject({
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		});
		expect(tool?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["keys:write"] }]);
	});

	it("proxies a scoped control-plane read with the exchanged user token", async () => {
		const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { current_workspace_id: "workspace_1" } }));
		vi.stubGlobal("fetch", fetchMock);
		const server = createServer(env, {
			accessToken: "upstream-token",
			workspaceId: "workspace_1",
			scopes: ["me:read"],
		});
		const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
		connectedClients.push(client);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		const result = await client.callTool({ name: "account_get", arguments: {} });
		expect(result.structuredContent).toEqual({ result: { data: { current_workspace_id: "workspace_1" } } });
		const request = fetchMock.mock.calls[0]?.[0] as Request;
		expect(request.url).toBe("https://api.phaseo.app/v1/me");
		expect(request.headers.get("authorization")).toBe("Bearer upstream-token");
	});
});

describe("Phaseo MCP OAuth discovery", () => {
	it("challenges unauthenticated clients without requesting gateway spend access", async () => {
		const response = await worker.fetch(
			new Request("https://mcp.phaseo.app/mcp", { method: "POST" }),
			env,
			{} as ExecutionContext,
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("no-store");
		const challenge = response.headers.get("www-authenticate") ?? "";
		expect(challenge).toContain("me:read models:read providers:read pricing:read credits:read activity:read analytics:read generations:read workspaces:read keys:read presets:read settings:read guardrails:read management_keys:read oauth_clients:read");
		expect(challenge).not.toContain("gateway:access");
	});

	it("publishes only the scopes required by the enabled MCP tools", async () => {
		const response = await worker.fetch(
			new Request("https://mcp.phaseo.app/.well-known/oauth-protected-resource/mcp"),
			env,
			{} as ExecutionContext,
		);
		const metadata = await response.json<{ resource: string; scopes_supported: string[] }>();

		expect(metadata.resource).toBe("https://mcp.phaseo.app/mcp");
		expect(metadata.scopes_supported).toEqual([
			"me:read",
			"models:read",
			"providers:read",
			"pricing:read",
			"credits:read",
			"activity:read",
			"analytics:read",
			"generations:read",
			"workspaces:read",
			"keys:read",
			"presets:read",
			"settings:read",
			"guardrails:read",
			"management_keys:read",
			"oauth_clients:read",
		]);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	});
});
