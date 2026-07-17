import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MCP_DELETE_SCOPES, MCP_MUTATION_TOOL_NAMES, MCP_WRITE_SCOPES } from "../src/mutation-tools";

vi.mock("agents/mcp", () => ({ createMcpHandler: vi.fn() }));

let worker: typeof import("../src/index").default;
let createServer: typeof import("../src/index").createServer;

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
	PHASEO_MCP_WRITE_TOOLS_ENABLED: "false",
	PHASEO_MCP_DESTRUCTIVE_TOOLS_ENABLED: "false",
	PHASEO_MCP_SECRET_TOOLS_ENABLED: "false",
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

	it("keeps ordinary writes behind both the feature flag and write scope", async () => {
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
		expect(tools.map(({ name }) => name)).toEqual(["api_key_update"]);
		const tool = tools.find(({ name }) => name === "api_key_update");
		expect(tool?.annotations).toMatchObject({
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		});
		expect(tool?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["keys:write"] }]);
	});

	it("isolates secret-returning and destructive tools behind separate flags", async () => {
		const server = createServer({
			...env,
			PHASEO_MCP_WRITE_TOOLS_ENABLED: "true",
			PHASEO_MCP_DESTRUCTIVE_TOOLS_ENABLED: "true",
			PHASEO_MCP_SECRET_TOOLS_ENABLED: "true",
		}, {
			accessToken: "upstream-token",
			workspaceId: "workspace_1",
			scopes: ["keys:write", "keys:delete"],
		});
		const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
		connectedClients.push(client);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		const tools = Object.fromEntries((await client.listTools()).tools.map((tool) => [tool.name, tool]));
		expect(Object.keys(tools)).toEqual(["api_key_create", "api_key_update", "api_key_delete"]);
		expect(tools.api_key_create?.annotations?.destructiveHint).toBe(false);
		expect(tools.api_key_delete?.annotations?.destructiveHint).toBe(true);
		expect(tools.api_key_delete?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["keys:delete"] }]);
	});

	it("registers the complete CRUD surface when every mutation class and scope is enabled", async () => {
		const server = createServer({
			...env,
			PHASEO_MCP_WRITE_TOOLS_ENABLED: "true",
			PHASEO_MCP_DESTRUCTIVE_TOOLS_ENABLED: "true",
			PHASEO_MCP_SECRET_TOOLS_ENABLED: "true",
		}, {
			accessToken: "upstream-token",
			workspaceId: "workspace_1",
			scopes: [...MCP_WRITE_SCOPES, ...MCP_DELETE_SCOPES],
		});
		const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
		connectedClients.push(client);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		expect((await client.listTools()).tools.map(({ name }) => name)).toEqual(MCP_MUTATION_TOOL_NAMES);
	});

	it("requires confirmation and proxies a scoped mutation with the exchanged user token", async () => {
		const fetchMock = vi.fn(async (request: Request) => {
			if (request.url.endsWith("/oauth/mcp/action-approval/prepare")) {
				return Response.json({
					approval_id: "11111111-1111-4111-8111-111111111111",
					execution_token: "execution-token-that-is-at-least-32-characters",
					expires_at: "2026-07-17T19:00:00.000Z",
					approval_url: "https://phaseo.app/mcp/approvals/11111111-1111-4111-8111-111111111111",
				});
			}
			if (request.url.endsWith("/oauth/mcp/action-approval/consume")) {
				return Response.json({ approval_id: "11111111-1111-4111-8111-111111111111", consumed: true });
			}
			if (request.url.endsWith("/oauth/mcp/action-approval/complete")) return Response.json({ completed: true });
			return Response.json({ data: { id: "key_1", name: "Updated" } });
		});
		vi.stubGlobal("fetch", fetchMock);
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

		const rejected = await client.callTool({ name: "api_key_update", arguments: { keyId: "key_1", name: "Updated" } });
		expect(rejected.isError).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();

		const prepared = await client.callTool({ name: "api_key_update", arguments: { keyId: "key_1", name: "Updated", confirm: true } });
		expect(prepared.structuredContent).toMatchObject({
			status: "approval_required",
			approval: { id: "11111111-1111-4111-8111-111111111111" },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const result = await client.callTool({
			name: "api_key_update",
			arguments: {
				keyId: "key_1",
				name: "Updated",
				confirm: true,
				approvalToken: "execution-token-that-is-at-least-32-characters",
			},
		});
		expect(result.structuredContent).toEqual({ status: "completed", result: { data: { id: "key_1", name: "Updated" } } });
		const request = fetchMock.mock.calls.map((call) => call[0] as Request).find((candidate) => candidate.url.endsWith("/v1/keys/key_1")) as Request;
		expect(request.url).toBe("https://api.phaseo.app/v1/keys/key_1");
		expect(request.method).toBe("PATCH");
		expect(request.headers.get("authorization")).toBe("Bearer upstream-token");
		expect(await request.clone().json()).toEqual({ name: "Updated" });
	});

	it("keeps generated secrets out of MCP results and returns a one-time reveal URL", async () => {
		const plaintextKey = "phaseo_v1_sk_secret-that-must-never-reach-the-model";
		const fetchMock = vi.fn(async (request: Request) => {
			if (request.url.endsWith("/oauth/mcp/action-approval/prepare")) return Response.json({
				approval_id: "22222222-2222-4222-8222-222222222222",
				execution_token: "secret-execution-token-that-is-long-enough",
				expires_at: "2026-07-17T19:00:00.000Z",
				approval_url: "https://phaseo.app/mcp/approvals/22222222-2222-4222-8222-222222222222",
			});
			if (request.url.endsWith("/oauth/mcp/action-approval/consume")) return Response.json({ approval_id: "22222222-2222-4222-8222-222222222222", consumed: true });
			if (request.url.endsWith("/v1/keys")) return Response.json({ data: { id: "key_2", prefix: "phaseo_v1", key: plaintextKey } });
			if (request.url.endsWith("/oauth/mcp/secret-reveal/store")) return Response.json({
				reveal_id: "33333333-3333-4333-8333-333333333333",
				reveal_url: "https://phaseo.app/mcp/secret-reveals/33333333-3333-4333-8333-333333333333",
				expires_at: "2026-07-17T19:05:00.000Z",
			});
			if (request.url.endsWith("/oauth/mcp/action-approval/complete")) return Response.json({ completed: true });
			return new Response("not found", { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);
		const server = createServer({ ...env, PHASEO_MCP_WRITE_TOOLS_ENABLED: "true", PHASEO_MCP_SECRET_TOOLS_ENABLED: "true" }, {
			accessToken: "upstream-token", workspaceId: "workspace_1", scopes: ["keys:write"],
		});
		const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
		connectedClients.push(client);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		await client.callTool({ name: "api_key_create", arguments: { name: "Secret key", confirm: true } });
		const result = await client.callTool({
			name: "api_key_create",
			arguments: { name: "Secret key", confirm: true, approvalToken: "secret-execution-token-that-is-long-enough" },
		});
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain(plaintextKey);
		expect(result.structuredContent).toMatchObject({
			status: "completed",
			result: { data: { id: "key_2", key: "[available only through the Phaseo one-time reveal page]" } },
			secretReveal: { id: "33333333-3333-4333-8333-333333333333" },
		});
		const storeRequest = fetchMock.mock.calls.map((call) => call[0] as Request).find((request) => request.url.endsWith("/oauth/mcp/secret-reveal/store")) as Request;
		expect(await storeRequest.clone().json()).toMatchObject({ secrets: { "result.data.key": plaintextKey } });
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
	it("enforces the body limit even when Content-Length is absent", async () => {
		const oversized = new Uint8Array(1024 * 1024 + 1);
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(oversized);
				controller.close();
			},
		});
		const response = await worker.fetch(
			new Request("https://mcp.phaseo.app/mcp", {
				method: "POST",
				body,
				duplex: "half",
			} as RequestInit & { duplex: "half" }),
			env,
			{} as ExecutionContext,
		);
		expect(response.status).toBe(413);
	});

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

	it("publishes write and delete scopes only when their tool classes are enabled", async () => {
		const enabledEnv = {
			...env,
			PHASEO_MCP_WRITE_TOOLS_ENABLED: "true",
			PHASEO_MCP_DESTRUCTIVE_TOOLS_ENABLED: "true",
		};
		const response = await worker.fetch(
			new Request("https://mcp.phaseo.app/.well-known/oauth-protected-resource/mcp"),
			enabledEnv,
			{} as ExecutionContext,
		);
		const metadata = await response.json<{ scopes_supported: string[] }>();

		expect(metadata.scopes_supported).toContain("workspaces:write");
		expect(metadata.scopes_supported).toContain("oauth_clients:write");
		expect(metadata.scopes_supported).toContain("workspaces:delete");
		expect(metadata.scopes_supported).toContain("oauth_clients:delete");
		expect(metadata.scopes_supported).not.toContain("gateway:access");

		const challengeResponse = await worker.fetch(
			new Request("https://mcp.phaseo.app/mcp", { method: "POST" }),
			enabledEnv,
			{} as ExecutionContext,
		);
		const challenge = challengeResponse.headers.get("www-authenticate") ?? "";
		expect(challenge).not.toContain("keys:write");
		expect(challenge).not.toContain("keys:delete");
		expect(challenge).toContain("keys:read");
	});
});
