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
});

describe("Phaseo MCP server metadata", () => {
	it("advertises least-privilege OAuth scopes and exact output schemas", async () => {
		const server = createServer(env, {
			accessToken: "upstream-token",
			workspaceId: "workspace_1",
			scopes: ["models:read", "providers:read", "pricing:read", "keys:read"],
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
			"providers_list",
			"cost_estimate",
			"api_keys_list",
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
		expect(challenge).toContain("models:read providers:read pricing:read keys:read");
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
			"models:read",
			"providers:read",
			"pricing:read",
			"keys:read",
		]);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	});
});
