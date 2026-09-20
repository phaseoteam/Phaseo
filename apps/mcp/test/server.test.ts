import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("agents/mcp/server", () => ({ createMcpHandler: vi.fn() }));

let worker: typeof import("../src/index").default;
let createServer: typeof import("../src/index").createServer;
let normaliseControlPlaneResult: typeof import("../src/index").normaliseControlPlaneResult;

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
	PHASEO_WEB_BASE_URL: "https://phaseo.app",
	PHASEO_MCP_RESOURCE_SERVER_SECRET: "s".repeat(64),
};

const connectedClients: Client[] = [];

beforeAll(async () => {
	({ default: worker, createServer, normaliseControlPlaneResult } = await import("../src/index"));
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
				"models:read", "providers:read", "pricing:read", "credits:read",
				"activity:read", "analytics:read", "generations:read",
				"me:read", "keys:read", "workspaces:read", "presets:read",
				"settings:read", "guardrails:read", "management_keys:read", "oauth_clients:read",
			],
		});
		const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
		connectedClients.push(client);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		expect(client.getServerVersion()).toMatchObject({
			name: "Phaseo",
			title: "Phaseo",
			websiteUrl: "https://phaseo.app",
			icons: [
				{
					src: "https://phaseo.app/png_logo_light.png",
					mimeType: "image/png",
					sizes: ["1024x1024"],
				},
			],
		});

		const result = await client.listTools();
		const tools = Object.fromEntries(result.tools.map((tool) => [tool.name, tool]));

		expect(Object.keys(tools)).toEqual([
			"models_list",
			"model_get",
			"benchmark_rankings",
			"providers_list",
			"cost_estimate",
			"credits_get",
			"activity_list",
			"analytics_get",
			"generation_get",
			"logs_list",
			"log_get",
		]);
		expect(tools.models_list?.outputSchema).toMatchObject({
			type: "object",
			properties: { models: { type: "array" } },
			required: ["models"],
		});
		expect(tools.models_list?._meta?.securitySchemes).toEqual([
			{ type: "oauth2", scopes: ["models:read", "pricing:read"] },
		]);
		expect(tools.generation_get?.outputSchema).toMatchObject({
			type: "object",
			properties: { generation: { type: "object" } },
			required: ["generation"],
		});
		expect(Object.values(tools).every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
		expect(Object.values(tools).every((tool) => tool.annotations?.destructiveHint === false)).toBe(true);
		expect(Object.values(tools).every((tool) => tool.annotations?.openWorldHint === false)).toBe(true);
		expect(Object.keys(tools).some((name) => /(?:create|update|delete|remove)$/.test(name))).toBe(false);
	});

	it("normalizes every account-data result to the reviewed public schema", () => {
		const sensitive = {
			workspace_id: "workspace_private",
			user_id: "user_private",
			key_id: "key_private",
			prompt: "private prompt",
			output: "private output",
		};
		const results = [
			normaliseControlPlaneResult("credits_get", { credits: { balance_nanos: 4, ...sensitive } }),
			normaliseControlPlaneResult("activity_list", { activity: [{ request_id: "req_1", ...sensitive }] }),
			normaliseControlPlaneResult("analytics_get", { data: [{ date: "2026-07-26", requests: 1, ...sensitive }] }),
			normaliseControlPlaneResult("generation_get", { request_id: "req_1", ...sensitive }),
			normaliseControlPlaneResult("logs_list", { data: [{ request_id: "req_1", ...sensitive }] }),
			normaliseControlPlaneResult("log_get", { data: { request_id: "req_1", ...sensitive } }),
		];
		const serialized = JSON.stringify(results);
		for (const forbidden of ["workspace_private", "user_private", "key_private", "private prompt", "private output"]) {
			expect(serialized).not.toContain(forbidden);
		}
	});

	it("normalizes generation metadata without returning payloads or internal identifiers", async () => {
		const fetchMock = vi.fn().mockResolvedValue(Response.json({
			request_id: "req_123",
			created_at: "2026-07-26T12:00:00.000Z",
			provider: "openai",
			model_id: "openai/gpt-5.6-sol",
			endpoint: "responses",
			status_code: 200,
			success: true,
			usage: {
				input_tokens: 12,
				output_tokens: 4,
				total_tokens: 16,
				input_tokens_details: { cached_tokens: 3 },
				output_tokens_details: { reasoning_tokens: 2 },
			},
			cost_nanos: 250_000_000,
			workspace_id: "workspace_1",
			user_id: "user_private",
			key_id: "key_private",
			replay_request: { input: "private prompt" },
			io_log: { bucket: "private-bucket", payload: { response: "private output" } },
		}));
		vi.stubGlobal("fetch", fetchMock);
		const server = createServer(env, {
			accessToken: "upstream-token",
			workspaceId: "workspace_1",
			scopes: ["generations:read"],
		});
		const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
		connectedClients.push(client);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		const result = await client.callTool({ name: "generation_get", arguments: { requestId: "req_123" } });
		expect(result.structuredContent).toMatchObject({
			generation: {
				requestId: "req_123",
				provider: "openai",
				model: "openai/gpt-5.6-sol",
				inputTokens: 12,
				outputTokens: 4,
				cachedTokens: 3,
				reasoningTokens: 2,
				totalTokens: 16,
				costUsd: 0.25,
			},
		});
		const serialized = JSON.stringify(result.structuredContent);
		expect(serialized).not.toContain("workspace_1");
		expect(serialized).not.toContain("user_private");
		expect(serialized).not.toContain("key_private");
		expect(serialized).not.toContain("private prompt");
		expect(serialized).not.toContain("private output");
		const request = fetchMock.mock.calls[0]?.[0] as Request;
		expect(request.url).toBe("https://api.phaseo.app/v1/generations?id=req_123");
		expect(request.headers.get("authorization")).toBe("Bearer upstream-token");
	});

	it("returns the cheapest matching models in price order with factual Gateway availability", async () => {
		const model = (id: string, price: string, routable: boolean) => ({
			id,
			name: id,
			description: null,
			organization: { id: "lab", name: "Example Lab", color: null },
			modalities: { input: ["text"], output: ["text"] },
			limits: { input_tokens: 128_000, output_tokens: 8_000 },
			capabilities: { endpoints: ["responses"], parameters: ["tools"], parameter_details: {} },
			availability: { status: "active", provider_count: 1, active_provider_count: 1, coming_soon_provider_count: 0, inactive_provider_count: 0 },
			pricing: { pricing_plan: "standard", meters: {
				input_tokens: { unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", provider_id: "provider" },
				output_tokens: { unit: "token", unit_size: 1_000_000, price_per_unit: "10", currency: "USD", provider_id: "provider" },
			} },
			offers: [{
				provider: { id: "provider", name: "Provider" }, model: id, status: "active", routable,
				capabilities: { parameters: [], parameter_details: {} }, pricing: { pricing_plan: "standard", meters: {} },
			}],
		});
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, models: [
			model("lab/expensive", "5", true), model("lab/cheap", "1", false),
		] })));
		const server = createServer(env, {
			accessToken: "upstream-token", workspaceId: "workspace_1", scopes: ["models:read", "pricing:read"],
		});
		const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
		connectedClients.push(client);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		const result = await client.callTool({ name: "models_list", arguments: { sortBy: "input_price", limit: 2 } });
		expect(result.structuredContent).toMatchObject({ models: [
			{
				id: "lab/cheap",
				gatewayAvailable: false,
				gatewayModelId: null,
				providerSupport: [{
					providerId: "provider",
					providerName: "Provider",
					providerModelId: "lab/cheap",
					status: "active",
					routable: false,
					supportedParameters: [],
				}],
			},
			{
				id: "lab/expensive",
				gatewayAvailable: true,
				gatewayModelId: "lab/expensive",
				availableProviders: ["provider"],
				providerSupport: [{
					providerId: "provider",
					providerName: "Provider",
					providerModelId: "lab/expensive",
					status: "active",
					routable: true,
					supportedParameters: [],
				}],
			},
		] });
	});

	it("keeps benchmark order neutral while reporting Gateway availability", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const request = input instanceof Request ? input : new Request(input);
			if (request.url.includes("/api/_web/rankings/benchmarks")) return Response.json({ benchmarks: [{
				benchmark_id: "coding-v1", name: "Coding Index", category: "coding", benchmark_type: "numerical",
				lower_is_better: false, total_models: 2, entries: [
					{ model_id: "lab/first", model_name: "First", organisation_id: "lab", organisation_name: "Lab", score: 90, rank: 1, source_link: "https://example.com/source", updated_at: "2026-09-19T00:00:00Z" },
					{ model_id: "lab/second", model_name: "Second", organisation_id: "lab", organisation_name: "Lab", score: 80, rank: 2, source_link: null, updated_at: null },
				],
			}] });
			return Response.json({ ok: true, models: [{
				id: "lab/second", name: "Second", description: null,
				organization: { id: "lab", name: "Lab", color: null },
				modalities: { input: ["text"], output: ["text"] }, limits: { input_tokens: 1, output_tokens: 1 },
				capabilities: { endpoints: [], parameters: [], parameter_details: {} },
				availability: { status: "active", provider_count: 1, active_provider_count: 1, coming_soon_provider_count: 0, inactive_provider_count: 0 },
				pricing: { pricing_plan: "standard", meters: {} }, offers: [{
					provider: { id: "provider", name: "Provider" }, model: "lab/second", status: "active", routable: true,
					capabilities: { parameters: [], parameter_details: {} }, pricing: { pricing_plan: "standard", meters: {} },
				}],
			}] });
		});
		vi.stubGlobal("fetch", fetchMock);
		const server = createServer(env, {
			accessToken: "upstream-token", workspaceId: "workspace_1", scopes: ["models:read", "pricing:read"],
		});
		const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
		connectedClients.push(client);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		await client.connect(clientTransport);

		const result = await client.callTool({ name: "benchmark_rankings", arguments: { focus: "coding", limit: 2 } });
		expect(result.structuredContent).toMatchObject({ benchmark: { entries: [
			{ rank: 1, modelId: "lab/first", gatewayAvailable: false },
			{ rank: 2, modelId: "lab/second", gatewayAvailable: true, gatewayModelId: "lab/second" },
		] } });
	});
});

describe("Phaseo MCP OAuth discovery", () => {
	it("serves exactly one configured OpenAI domain-verification token", async () => {
		const missing = await worker.fetch(
			new Request("https://mcp.phaseo.app/.well-known/openai-apps-challenge"),
			env,
			{} as ExecutionContext,
		);
		expect(missing.status).toBe(404);

		const configured = await worker.fetch(
			new Request("https://mcp.phaseo.app/.well-known/openai-apps-challenge"),
			{ ...env, OPENAI_APPS_CHALLENGE_TOKEN: "  openai-review-token-123  " },
			{} as ExecutionContext,
		);
		expect(configured.status).toBe(200);
		expect(configured.headers.get("content-type")).toContain("text/plain");
		expect(configured.headers.get("cache-control")).toBe("no-store");
		expect(await configured.text()).toBe("openai-review-token-123");

		const head = await worker.fetch(
			new Request("https://mcp.phaseo.app/.well-known/openai-apps-challenge", { method: "HEAD" }),
			{ ...env, OPENAI_APPS_CHALLENGE_TOKEN: "openai-review-token-123" },
			{} as ExecutionContext,
		);
		expect(head.status).toBe(200);
		expect(await head.text()).toBe("");

		const post = await worker.fetch(
			new Request("https://mcp.phaseo.app/.well-known/openai-apps-challenge", { method: "POST" }),
			{ ...env, OPENAI_APPS_CHALLENGE_TOKEN: "openai-review-token-123" },
			{} as ExecutionContext,
		);
		expect(post.status).toBe(405);
		expect(post.headers.get("allow")).toBe("GET, HEAD");
	});

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
		expect(challenge).toContain("models:read providers:read pricing:read credits:read activity:read analytics:read generations:read");
		expect(challenge).not.toContain("gateway:access");
		expect(challenge).not.toContain("keys:read");
		expect(challenge).not.toContain("oauth_clients:read");
	});

	it("publishes only the scopes required by the enabled MCP tools", async () => {
		const response = await worker.fetch(
			new Request("https://mcp.phaseo.app/.well-known/oauth-protected-resource/mcp", {
				headers: { Origin: "http://localhost:6284" },
			}),
			env,
			{} as ExecutionContext,
		);
		const metadata = await response.json<{ resource: string; scopes_supported: string[] }>();

		expect(metadata.resource).toBe("https://mcp.phaseo.app/mcp");
		expect(metadata.scopes_supported).toEqual([
			"models:read",
			"providers:read",
			"pricing:read",
			"credits:read",
			"activity:read",
			"analytics:read",
			"generations:read",
		]);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
	});

	it("supports browser OAuth metadata discovery and preflight requests", async () => {
		const preflight = await worker.fetch(
			new Request("https://mcp.phaseo.app/.well-known/oauth-protected-resource/mcp", {
				method: "OPTIONS",
				headers: {
					Origin: "http://localhost:6284",
					"Access-Control-Request-Method": "GET",
					"Access-Control-Request-Headers": "authorization",
				},
			}),
			env,
			{} as ExecutionContext,
		);

		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
		expect(preflight.headers.get("access-control-allow-methods")).toContain("GET");
		expect(preflight.headers.get("access-control-allow-headers")).toContain("Authorization");

		const fallback = await worker.fetch(
			new Request("https://mcp.phaseo.app/.well-known/oauth-protected-resource", {
				headers: { Origin: "http://localhost:6284" },
			}),
			env,
			{} as ExecutionContext,
		);
		const metadata = await fallback.json<{ resource: string; authorization_servers: string[] }>();

		expect(fallback.status).toBe(200);
		expect(fallback.headers.get("access-control-allow-origin")).toBe("*");
		expect(metadata.resource).toBe("https://mcp.phaseo.app/mcp");
		expect(metadata.authorization_servers).toEqual(["https://api.phaseo.app/oauth"]);
	});

});
