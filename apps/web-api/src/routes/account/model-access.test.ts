import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	GATEWAY_API_ORIGIN: "https://gateway.example.com",
	GATEWAY_INTERNAL_TEST_TOKEN: "internal-token",
};

afterEach(() => vi.unstubAllGlobals());

const gatewayAccess = {
	ok: true,
	workspace_id: "workspace-1",
	source: "member",
	restricted: true,
	hidden_model_count: 1,
	limited_model_count: 1,
	hidden_models: [{ id: "openai/gpt-x", name: "GPT X" }],
	limited_models: { "anthropic/claude-y": ["anthropic"] },
};

/** Supabase auth and membership for user-1, and the gateway's answer (or a failure) for /internal/model-access. */
function stubFetch({ member = true, gateway = () => Response.json(gatewayAccess) }: { member?: boolean; gateway?: () => Response } = {}) {
	const gatewayCalls: Request[] = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(input, init);
		const url = request.url;
		if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" });
		if (url.includes("workspace_members")) return Response.json(member ? [{ role: "member" }] : []);
		if (url.includes("/workspaces")) return Response.json([{ owner_user_id: "owner-1", slug: "acme", name: "Acme" }]);
		if (url.startsWith("https://gateway.example.com/internal/model-access")) {
			gatewayCalls.push(request);
			return gateway();
		}
		return Response.json([]);
	}));
	return gatewayCalls;
}

describe("GET /api/account/settings/models/access", () => {
	it("asks the gateway about the member in the requested workspace and returns its answer, privately", async () => {
		const gatewayCalls = stubFetch();
		const response = await app.request("https://phaseo.app/api/account/settings/models/access?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(gatewayCalls).toHaveLength(1);
		const gatewayUrl = new URL(gatewayCalls[0]!.url);
		expect(gatewayUrl.searchParams.get("workspace_id")).toBe("workspace-1");
		expect(gatewayUrl.searchParams.get("user_id")).toBe("user-1");
		expect(gatewayCalls[0]!.headers.get("authorization")).toBe("Bearer internal-token");
		await expect(response.json()).resolves.toEqual({
			workspaceId: "workspace-1",
			workspaceName: "Acme",
			source: "member",
			restricted: true,
			hiddenModelCount: 1,
			limitedModelCount: 1,
			hiddenModels: [{ id: "openai/gpt-x", name: "GPT X" }],
			limitedModels: { "anthropic/claude-y": ["anthropic"] },
		});
	});

	it("uses the workspace picked in the header (the activeWorkspaceId cookie) when none is passed", async () => {
		const gatewayCalls = stubFetch();
		const response = await app.request("https://phaseo.app/api/account/settings/models/access", { headers: { authorization: "Bearer session-token", cookie: "activeWorkspaceId=workspace-1" } }, env);
		expect(response.status).toBe(200);
		expect(new URL(gatewayCalls[0]!.url).searchParams.get("workspace_id")).toBe("workspace-1");
	});

	it("refuses a workspace the user isn't in instead of answering for another one", async () => {
		const gatewayCalls = stubFetch({ member: false });
		const response = await app.request("https://phaseo.app/api/account/settings/models/access?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(403);
		expect(gatewayCalls).toHaveLength(0);
	});

	it("refuses signed-out requests", async () => {
		const gatewayCalls = stubFetch();
		const response = await app.request("https://phaseo.app/api/account/settings/models/access?workspaceId=workspace-1", {}, env);
		expect(response.status).toBe(403);
		expect(gatewayCalls).toHaveLength(0);
	});

	it("says it can't tell, rather than that nothing is hidden, when the gateway fails", async () => {
		stubFetch({ gateway: () => Response.json({ error: "model_access_unavailable" }, { status: 503 }) });
		const response = await app.request("https://phaseo.app/api/account/settings/models/access?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({ error: "model_access_unavailable" });
	});
});
