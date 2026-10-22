import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateManagement = vi.fn();
const listHubTools = vi.fn();
const callHubTool = vi.fn();
const inserted: Array<Record<string, unknown>> = [];

vi.mock("@/pipeline/before/auth", () => ({ authenticateManagement: (...args: unknown[]) => authenticateManagement(...args) }));
vi.mock("@core/mcp-hub/hub", async (importOriginal) => ({
	...(await importOriginal<typeof import("@core/mcp-hub/hub")>()),
	listHubTools: (...args: unknown[]) => listHubTools(...args),
	callHubTool: (...args: unknown[]) => callHubTool(...args),
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getSupabaseAdmin: () => ({ from: () => ({ insert: async (row: Record<string, unknown>) => { inserted.push(row); return { error: null }; } }) }),
}));

import { Hono } from "hono";
import { internalMcpHubRoutes } from "./mcp-hub";
import { HubError } from "@core/mcp-hub/hub";

const SECRET = "s".repeat(64);
const RESOURCE = "https://mcp.phaseo.app/mcp";
const env = {
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "service-role",
	GATEWAY_CACHE: {} as KVNamespace,
	PHASEO_MCP_RESOURCE_SERVER_SECRET: SECRET,
	MCP_HUB_ENABLED: "true",
	MCP_CONNECTIONS_KEY_V1: Buffer.alloc(32, 1).toString("base64"),
};
const app = new Hono().route("/internal/mcp-hub", internalMcpHubRoutes as never);
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;

function post(path: string, body: Record<string, unknown>, options: { secret?: string; env?: Record<string, unknown> } = {}) {
	return app.request(`https://gateway.test/internal/mcp-hub${path}`, {
		method: "POST",
		headers: { authorization: `Basic ${btoa(`phaseo_mcp_resource_server:${options.secret ?? SECRET}`)}`, "content-type": "application/json" },
		body: JSON.stringify({ subject_token: "person-token", resource: RESOURCE, ...body }),
	}, { ...env, ...options.env }, executionCtx);
}

beforeEach(() => {
	vi.clearAllMocks();
	inserted.length = 0;
	authenticateManagement.mockResolvedValue({ ok: true, authMethod: "oauth", userId: "user-a", workspaceId: "ws-1", oauthResource: RESOURCE, oauthScopes: ["models:read", "connections:use"] });
	listHubTools.mockResolvedValue({ tools: [], connections: [] });
	callHubTool.mockResolvedValue({ result: { content: [{ type: "text", text: "ok" }] }, status: "ok", errorCode: null, injectionFlagged: false, responseBytes: 42 });
});

describe("internal MCP hub routes", () => {
	it("needs the resource server secret and a token for this resource with connections:use", async () => {
		expect((await post("/tools", {}, { secret: "wrong".repeat(13) })).status).toBe(401);
		expect((await post("/tools", {}, { env: { MCP_HUB_ENABLED: undefined } })).status).toBe(404);

		authenticateManagement.mockResolvedValueOnce({ ok: true, authMethod: "oauth", userId: "user-a", workspaceId: "ws-1", oauthResource: "https://elsewhere.test/mcp", oauthScopes: ["connections:use"] });
		expect((await post("/tools", {})).status).toBe(401);
		authenticateManagement.mockResolvedValueOnce({ ok: true, authMethod: "oauth", userId: "user-a", workspaceId: "ws-1", oauthResource: RESOURCE, oauthScopes: ["models:read"] });
		expect((await post("/tools", {})).status).toBe(403);
		expect(listHubTools).not.toHaveBeenCalled();

		expect((await post("/tools", {})).status).toBe(200);
		expect(listHubTools).toHaveBeenCalledWith(expect.anything(), { workspaceId: "ws-1", userId: "user-a" });
		const checked = authenticateManagement.mock.calls.at(-1)?.[0] as Request;
		expect(checked.headers.get("authorization")).toBe("Bearer person-token");
	});

	it("calls the tool as the token's owner and logs sizes and outcome, not content", async () => {
		const response = await post("/call", { connection_id: "conn-1", tool: "list_issues", arguments: { query: "secret project" } });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ result: { content: [{ type: "text", text: "ok" }] }, injectionFlagged: false });
		expect(callHubTool).toHaveBeenCalledWith(expect.anything(), { workspaceId: "ws-1", userId: "user-a" }, { connectionId: "conn-1", tool: "list_issues", arguments: { query: "secret project" } });
		expect(inserted).toHaveLength(1);
		expect(inserted[0]).toMatchObject({ workspace_id: "ws-1", user_id: "user-a", connection_id: "conn-1", tool_name: "list_issues", status: "ok", response_bytes: 42, surface: "mcp" });
		expect(JSON.stringify(inserted[0])).not.toContain("secret project");
	});

	it("logs refusals and does not log calls to connections the person doesn't have", async () => {
		callHubTool.mockRejectedValueOnce(new HubError("tool_disabled", "off"));
		expect((await post("/call", { connection_id: "conn-1", tool: "delete_issue" })).status).toBe(409);
		expect(inserted.at(-1)).toMatchObject({ status: "blocked", error_code: "tool_disabled" });

		callHubTool.mockRejectedValueOnce(new HubError("not_found", "gone"));
		const before = inserted.length;
		expect((await post("/call", { connection_id: "someone-elses", tool: "x" })).status).toBe(404);
		expect(inserted.length).toBe(before);
	});
});
