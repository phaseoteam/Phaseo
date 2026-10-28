import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("agents/mcp/server", () => ({
	createMcpHandler: vi.fn(() => async () => new Response("ok", { status: 200 })),
}));

let worker: typeof import("../src/index").default;
let createServer: typeof import("../src/index").createServer;
let management: typeof import("../src/management");

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
	PHASEO_WEB_BASE_URL: "https://phaseo.app",
	PHASEO_MCP_RESOURCE_SERVER_SECRET: "s".repeat(64),
};

const READ_ONLY = ["models:read", "providers:read", "pricing:read", "credits:read", "activity:read", "analytics:read", "generations:read"];
const connectedClients: Client[] = [];

beforeAll(async () => {
	({ default: worker, createServer } = await import("../src/index"));
	management = await import("../src/management");
});

afterEach(async () => {
	await Promise.all(connectedClients.splice(0).map((client) => client.close()));
	vi.unstubAllGlobals();
});

async function connect(scopes: string[], options: { managementAccess?: boolean } = {}) {
	const server = createServer(env, { accessToken: "upstream-token", workspaceId: "workspace_1", scopes }, options);
	const client = new Client({ name: "phaseo-mcp-test", version: "1.0.0" });
	connectedClients.push(client);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	return client;
}

async function toolNames(scopes: string[], options: { managementAccess?: boolean } = {}) {
	const client = await connect(scopes, options);
	return (await client.listTools()).tools.map((tool) => tool.name);
}

function stubApi(response: Response | (() => Response)) {
	const fetchMock = vi.fn(async (_request: Request) => typeof response === "function" ? response() : response.clone());
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

async function sentRequest(fetchMock: ReturnType<typeof stubApi>) {
	const request = fetchMock.mock.calls[0]?.[0] as Request;
	const text = await request.clone().text();
	return { method: request.method, url: request.url, authorization: request.headers.get("authorization"), body: text ? JSON.parse(text) : undefined };
}

describe("Phaseo MCP management scope gating", () => {
	it("keeps read-only connections free of management tools, even with older management read scopes", async () => {
		const names = await toolNames([...READ_ONLY, "keys:read", "presets:read", "settings:read", "guardrails:read"]);
		for (const definition of management.managementTools) expect(names).not.toContain(definition.name);
	});

	it("exposes only the tools whose route scopes were granted", async () => {
		const names = await toolNames([...READ_ONLY, "keys:read", "keys:write"]);
		expect(names.filter((name) => management.managementTools.some((tool) => tool.name === name))).toEqual([
			"api_keys_list",
			"api_key_get",
			"api_key_create",
			"api_key_update",
			"api_key_rotate",
		]);
	});

	it("lists a write tool without its read tool when only the write scope was granted", async () => {
		const names = await toolNames(["budgets:write"]);
		expect(names).toEqual(expect.arrayContaining(["budget_create", "budget_update"]));
		expect(names).not.toContain("budgets_list");
		expect(names).not.toContain("budget_delete");
	});

	it("shows management read tools on the manage URL when the user granted only read permissions", async () => {
		const names = await toolNames([...READ_ONLY, "keys:read", "settings:read"], { managementAccess: true });
		expect(names.filter((name) => management.managementTools.some((tool) => tool.name === name))).toEqual([
			"api_keys_list",
			"api_key_get",
			"settings_get",
			"webhooks_list",
			"observability_destinations_list",
		]);
	});

	it("registers every management tool when every management scope is granted", async () => {
		const names = await toolNames([...READ_ONLY, ...management.MCP_MANAGEMENT_SCOPES]);
		expect(names).toEqual(expect.arrayContaining(management.managementTools.map((tool) => tool.name)));
	});

	it("gates each tool on the scope its Management API route requires", () => {
		const scopes = Object.fromEntries(management.managementTools.map((tool) => [tool.name, tool.scopes]));
		expect(scopes).toMatchObject({
			api_keys_list: ["keys:read"],
			api_key_create: ["keys:write"],
			api_key_rotate: ["keys:write"],
			api_key_delete: ["keys:delete"],
			budget_delete: ["budgets:delete"],
			spend_rule_delete: ["spend_rules:delete"],
			provider_key_create: ["provider_credentials:write"],
			provider_key_delete: ["provider_credentials:delete"],
			guardrail_keys_set: ["guardrails:write"],
			guardrail_delete: ["guardrails:delete"],
			preset_version_publish: ["presets:write"],
			settings_update: ["settings:write"],
			webhook_delete: ["settings:write"],
			observability_destination_delete: ["settings:write"],
		});
		const granted = new Set<string>(management.MCP_MANAGEMENT_SCOPES);
		for (const tool of management.managementTools) {
			for (const scope of tool.scopes) expect(granted.has(scope)).toBe(true);
		}
	});

	it("sets annotations so clients confirm changes and deletions", async () => {
		const client = await connect([...READ_ONLY, ...management.MCP_MANAGEMENT_SCOPES]);
		const tools = Object.fromEntries((await client.listTools()).tools.map((tool) => [tool.name, tool]));
		for (const definition of management.managementTools) {
			const annotations = tools[definition.name]?.annotations;
			expect(annotations?.readOnlyHint, definition.name).toBe(definition.effect === "read");
			expect(annotations?.destructiveHint, definition.name).toBe(definition.effect === "update" || definition.effect === "delete");
			expect(annotations?.openWorldHint, definition.name).toBe(false);
			expect(tools[definition.name]?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: [...definition.scopes] }]);
		}
		expect(tools.api_key_delete?.annotations).toMatchObject({ destructiveHint: true, idempotentHint: true });
		expect(tools.api_key_create?.annotations).toMatchObject({ destructiveHint: false, idempotentHint: false });
		expect(tools.api_key_rotate?.annotations).toMatchObject({ destructiveHint: true, idempotentHint: false });
		expect(tools.preset_version_publish?.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
		expect(tools.settings_update?.annotations).toMatchObject({ destructiveHint: true, idempotentHint: true });
		for (const definition of management.managementTools) {
			const schema = tools[definition.name]?.inputSchema as { properties?: Record<string, { description?: string }> };
			for (const [field, property] of Object.entries(schema.properties ?? {})) {
				expect(property.description, `${definition.name}.${field}`).toBeTruthy();
			}
		}
	});
});

describe("Phaseo MCP management request mapping", () => {
	it("creates an API key and flags the one-time secret without leaving it in the result", async () => {
		const fetchMock = stubApi(Response.json({
			key: "sk-phaseo-secret",
			data: { id: "key_1", name: "CI", prefix: "sk-phaseo-ab", key: "sk-phaseo-secret" },
		}, { status: 201 }));
		const client = await connect(["keys:write"]);
		const result = await client.callTool({ name: "api_key_create", arguments: { name: "CI", limit: 25, limit_reset: "monthly" } });

		expect(await sentRequest(fetchMock)).toEqual({
			method: "POST",
			url: "https://api.phaseo.app/v1/keys",
			authorization: "Bearer upstream-token",
			body: { name: "CI", limit: 25, limit_reset: "monthly" },
		});
		expect(result.isError).toBeFalsy();
		const structured = result.structuredContent as { result: unknown; oneTimeSecret: Record<string, unknown> };
		expect(structured.oneTimeSecret).toMatchObject({ label: "API key", value: "sk-phaseo-secret", shownOnce: true });
		expect(JSON.stringify(structured.result)).not.toContain("sk-phaseo-secret");
		expect(structured.result).toEqual({ data: { id: "key_1", name: "CI", prefix: "sk-phaseo-ab" } });
		const text = (result.content as Array<{ text: string }>)[0]!.text;
		expect(text).toContain("ONE-TIME SECRET (API key): sk-phaseo-secret");
		expect(text.match(/sk-phaseo-secret/g)).toHaveLength(1);
	});

	it("rotates a key with the handover expiry and returns the replacement secret once", async () => {
		const fetchMock = stubApi(Response.json({ data: { id: "key_2", key: "sk-phaseo-new" }, previous_key_expires_at: "2026-11-01T00:00:00.000Z" }));
		const client = await connect(["keys:write"]);
		const result = await client.callTool({ name: "api_key_rotate", arguments: { id: "key_1", previous_key_expires_at: "2026-11-01T00:00:00Z" } });
		expect(await sentRequest(fetchMock)).toMatchObject({
			method: "POST",
			url: "https://api.phaseo.app/v1/keys/key_1/rotate",
			body: { previous_key_expires_at: "2026-11-01T00:00:00Z" },
		});
		expect((result.structuredContent as { oneTimeSecret: { value: string } }).oneTimeSecret.value).toBe("sk-phaseo-new");
	});

	it("encodes path ids and sends no body for deletes", async () => {
		const fetchMock = stubApi(Response.json({ deleted: true }));
		const client = await connect(["keys:delete"]);
		const result = await client.callTool({ name: "api_key_delete", arguments: { id: "../budgets/1" } });
		expect(await sentRequest(fetchMock)).toEqual({
			method: "DELETE",
			url: "https://api.phaseo.app/v1/keys/..%2Fbudgets%2F1",
			authorization: "Bearer upstream-token",
			body: undefined,
		});
		expect(result.structuredContent).toEqual({ result: { deleted: true } });
	});

	it("accepts an empty 204 response", async () => {
		stubApi(() => new Response(null, { status: 204 }));
		const client = await connect(["settings:write"]);
		const result = await client.callTool({ name: "webhook_delete", arguments: { id: "wh_1" } });
		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toEqual({ result: {} });
	});

	it("sends only the settings the agent chose to change", async () => {
		const fetchMock = stubApi(Response.json({ data: { routing_mode: "price", privacy_zdr_only: true } }));
		const client = await connect(["settings:write"]);
		await client.callTool({ name: "settings_update", arguments: { routing_mode: "price", privacy_zdr_only: true } });
		expect(await sentRequest(fetchMock)).toMatchObject({
			method: "PATCH",
			url: "https://api.phaseo.app/v1/settings",
			body: { routing_mode: "price", privacy_zdr_only: true },
		});
	});

	it("replaces a guardrail's keys with PUT", async () => {
		const fetchMock = stubApi(Response.json({ data: { key_ids: ["key_1"] } }));
		const client = await connect(["guardrails:write"]);
		await client.callTool({ name: "guardrail_keys_set", arguments: { id: "guard_1", key_ids: ["key_1"] } });
		expect(await sentRequest(fetchMock)).toMatchObject({
			method: "PUT",
			url: "https://api.phaseo.app/v1/guardrails/guard_1/keys",
			body: { key_ids: ["key_1"] },
		});
	});

	it("publishes a preset version", async () => {
		const fetchMock = stubApi(Response.json({ data: { version_number: 3 } }, { status: 201 }));
		const client = await connect(["presets:write"]);
		await client.callTool({ name: "preset_version_publish", arguments: { id: "preset_1", release_notes: "Lower temperature" } });
		expect(await sentRequest(fetchMock)).toMatchObject({
			method: "POST",
			url: "https://api.phaseo.app/v1/presets/preset_1/versions",
			body: { release_notes: "Lower temperature" },
		});
	});

	it("lists provider keys with query filters and never returns stored secrets", async () => {
		const fetchMock = stubApi(Response.json({
			data: [{ id: "byok_1", provider_id: "openai", prefix: "sk-", suffix: "abcd", key: "sk-provider-secret", encrypted_key: "ciphertext" }],
		}));
		const client = await connect(["provider_credentials:read", "provider_credentials:write"]);
		const result = await client.callTool({ name: "provider_keys_list", arguments: { provider: "openai", limit: 5 } });
		expect(await sentRequest(fetchMock)).toMatchObject({ method: "GET", url: "https://api.phaseo.app/v1/byok?limit=5&provider=openai" });
		const serialised = JSON.stringify(result);
		expect(serialised).not.toContain("sk-provider-secret");
		expect(serialised).not.toContain("ciphertext");
		expect(result.structuredContent).toEqual({ result: { data: [{ id: "byok_1", provider_id: "openai", prefix: "sk-", suffix: "abcd" }] } });
	});

	it("sends a provider key on create but does not echo it", async () => {
		const fetchMock = stubApi(Response.json({ data: { id: "byok_2", provider_id: "anthropic" } }, { status: 201 }));
		const client = await connect(["provider_credentials:write"]);
		const result = await client.callTool({ name: "provider_key_create", arguments: { provider: "anthropic", name: "Team", key: "sk-ant-secret", routing_mode: "fallback" } });
		expect((await sentRequest(fetchMock)).body).toEqual({ provider: "anthropic", name: "Team", key: "sk-ant-secret", routing_mode: "fallback" });
		expect(JSON.stringify(result)).not.toContain("sk-ant-secret");
		expect((result.structuredContent as Record<string, unknown>).oneTimeSecret).toBeUndefined();
	});

	it("flags a new webhook's signing secret", async () => {
		stubApi(Response.json({ id: "wh_1", url: "https://example.com/hook", signing_secret: "whsec_123" }, { status: 201 }));
		const client = await connect(["settings:write"]);
		const result = await client.callTool({ name: "webhook_create", arguments: { url: "https://example.com/hook", events: ["batch.completed"] } });
		const structured = result.structuredContent as { result: Record<string, unknown>; oneTimeSecret: Record<string, unknown> };
		expect(structured.oneTimeSecret).toMatchObject({ label: "webhook signing secret", value: "whsec_123" });
		expect(structured.result).toEqual({ id: "wh_1", url: "https://example.com/hook" });
	});

	it("rejects invalid input before calling the API", async () => {
		const fetchMock = stubApi(Response.json({}));
		const client = await connect(["budgets:write"]);
		const result = await client.callTool({ name: "budget_create", arguments: { interval: "hourly", limit: 10 } });
		expect(result.isError).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("propagates API validation and permission errors readably", async () => {
		stubApi(Response.json({ error: "conflict", message: "A monthly budget already exists" }, { status: 409 }));
		const client = await connect(["budgets:write"]);
		const conflict = await client.callTool({ name: "budget_create", arguments: { interval: "monthly", limit: 10 } });
		expect(conflict).toMatchObject({ isError: true, content: [{ type: "text", text: "Phaseo rejected the request (HTTP 409): A monthly budget already exists" }] });

		stubApi(Response.json({ error: "forbidden", message: "Workspace role must be one of: owner, admin" }, { status: 403 }));
		const forbidden = await client.callTool({ name: "budget_update", arguments: { id: "budget_1", limit: 5 } });
		expect((forbidden.content as Array<{ text: string }>)[0]!.text).toBe(
			"Phaseo rejected the request (HTTP 403): Workspace role must be one of: owner, admin Your workspace role or this connection's permissions do not allow this action.",
		);
	});

	it("never forwards server error details", async () => {
		stubApi(Response.json({ error: "internal", message: "relation workspace_budgets does not exist" }, { status: 500 }));
		const client = await connect(["budgets:read", "budgets:write"]);
		const result = await client.callTool({ name: "budgets_list", arguments: {} });
		expect(result).toMatchObject({ isError: true, content: [{ type: "text", text: "Phaseo rejected the request (HTTP 500): Phaseo could not complete the request (500)." }] });
	});
});

describe("Phaseo MCP management OAuth opt-in", () => {
	it("keeps the plain URL's challenge read-only", async () => {
		const response = await worker.fetch(new Request("https://mcp.phaseo.app/mcp", { method: "POST" }), env, {} as ExecutionContext);
		const challenge = response.headers.get("www-authenticate") ?? "";
		expect(challenge).toContain(`scope="${READ_ONLY.join(" ")}"`);
		expect(challenge).toContain('resource_metadata="https://mcp.phaseo.app/.well-known/oauth-protected-resource/mcp"');
		expect(challenge).not.toContain(":write");
	});

	it("requests management scopes only on the manage URL", async () => {
		const response = await worker.fetch(new Request("https://mcp.phaseo.app/mcp?access=manage", { method: "POST" }), env, {} as ExecutionContext);
		expect(response.status).toBe(401);
		const challenge = response.headers.get("www-authenticate") ?? "";
		expect(challenge).toContain(`scope="${[...READ_ONLY, ...management.MCP_MANAGEMENT_SCOPES].join(" ")}"`);
		expect(challenge).toContain('resource_metadata="https://mcp.phaseo.app/.well-known/oauth-protected-resource/mcp?access=manage"');
		expect(challenge).not.toContain("gateway:access");
		expect(challenge).not.toContain("management_keys");
		expect(challenge).not.toContain("workspaces:");
	});

	it("lists management scopes in resource metadata only for the manage URL", async () => {
		const plain = await (await worker.fetch(new Request("https://mcp.phaseo.app/.well-known/oauth-protected-resource/mcp"), env, {} as ExecutionContext))
			.json<{ resource: string; scopes_supported: string[] }>();
		const manage = await (await worker.fetch(new Request("https://mcp.phaseo.app/.well-known/oauth-protected-resource/mcp?access=manage"), env, {} as ExecutionContext))
			.json<{ resource: string; scopes_supported: string[] }>();
		expect(plain.scopes_supported).toEqual([...READ_ONLY, "gateway:access"]);
		expect(manage.resource).toBe("https://mcp.phaseo.app/mcp");
		expect(manage.scopes_supported).toEqual([...READ_ONLY, ...management.MCP_MANAGEMENT_SCOPES, "gateway:access"]);
	});

	it("asks a read-only connection opened with the manage URL to sign in again", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({
			active: true,
			resource: "https://mcp.phaseo.app/mcp",
			workspace_id: "workspace_1",
			user_id: "user_1",
			client_id: "client_1",
			scope: READ_ONLY.join(" "),
			upstream_access_token: "upstream-token",
		})));
		const request = () => new Request("https://mcp.phaseo.app/mcp?access=manage", { method: "POST", headers: { Authorization: "Bearer delegated-token" } });
		const response = await worker.fetch(request(), env, {} as ExecutionContext);
		expect(response.status).toBe(403);
		const challenge = response.headers.get("www-authenticate") ?? "";
		expect(challenge).toContain('error="insufficient_scope"');
		expect(challenge).toContain("keys:write");

		const plain = await worker.fetch(new Request("https://mcp.phaseo.app/mcp", { method: "POST", headers: { Authorization: "Bearer delegated-token" } }), env, {} as ExecutionContext);
		expect(plain.status).toBe(200);
	});
});
