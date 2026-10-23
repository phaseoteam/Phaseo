import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const POLICY = "00000000-0000-4000-8000-0000000000a1";
const KEY = "00000000-0000-4000-8000-0000000000b1";
const DEPARTMENT = "00000000-0000-4000-8000-0000000000c1";
const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	KEY_PEPPER_ACTIVE: "pepper",
	PHASEO_GATEWAY_URL: "https://gateway.test",
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;

type Fixture = {
	role?: string | null;
	gateway?: (request: Request) => Response | Promise<Response>;
	throttleError?: boolean;
};

function database(fixture: Fixture = {}) {
	const requests: Array<{ url: URL; method: string; body: any; headers: Headers }> = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
		requests.push({ url, method: request.method, body: text ? JSON.parse(text) : null, headers: request.headers });
		if (url.hostname === "gateway.test") return fixture.gateway ? fixture.gateway(request) : new Response("{}", { status: 500 });
		if (url.pathname.endsWith("/auth/v1/user")) return Response.json({ id: "user-a", email: "fixture@example.com", app_metadata: {} });
		if (url.pathname.endsWith("/workspace_members")) {
			if (url.searchParams.get("user_id")) return Response.json(fixture.role ? [{ role: fixture.role }] : []);
			return Response.json([{ user_id: "user-a", role: "admin", users: { display_name: "Ada" } }, { user_id: "user-b", role: "member", users: null }]);
		}
		if (url.pathname.endsWith("/workspaces")) return Response.json([{ owner_user_id: "owner", slug: "workspace-a", name: "Workspace A" }]);
		if (url.pathname.endsWith("/workspace_rate_limit_policies")) {
			return Response.json([{
				id: POLICY, name: "Standard", description: null, requests_per_minute: 60, tokens_per_minute: "200000",
				concurrent_requests: null, fail_closed: false, updated_at: "2026-10-22T09:00:00Z",
			}]);
		}
		if (url.pathname.endsWith("/workspace_rate_limit_policy_assignments")) {
			return Response.json([
				{ id: "00000000-0000-4000-8000-0000000000d1", policy_id: POLICY, target_type: "key", key_id: KEY, user_id: null, department_id: null, guardrail_id: null },
				{ id: "00000000-0000-4000-8000-0000000000d2", policy_id: POLICY, target_type: "department", key_id: null, user_id: null, department_id: DEPARTMENT, guardrail_id: null },
				{ id: "00000000-0000-4000-8000-0000000000d3", policy_id: POLICY, target_type: "end_user_default", key_id: null, user_id: null, department_id: null, guardrail_id: null },
			]);
		}
		if (url.pathname.endsWith("/keys")) return Response.json([{ id: KEY, name: "Production", prefix: "abc123", status: "active" }]);
		if (url.pathname.endsWith("/workspace_departments")) return Response.json([{ id: DEPARTMENT, name: "Engineering" }]);
		if (url.pathname.endsWith("/workspace_guardrails")) return Response.json([]);
		if (url.pathname.endsWith("/rpc/workspace_rate_limit_throttle_summary")) {
			if (fixture.throttleError) return Response.json({ message: "boom" }, { status: 500 });
			return Response.json([{ policy_id: POLICY, throttled_requests: 12, last_throttled_at: "2026-10-22T08:59:00+00:00" }]);
		}
		throw new Error(`Unexpected fixture request: ${request.method} ${url.pathname}`);
	}));
	return requests;
}

function call(path: string, init: RequestInit = {}) {
	return app.request(`https://phaseo.app/api/account/settings${path}`, {
		...init,
		headers: { authorization: "Bearer fixture-token", "content-type": "application/json", ...(init.headers ?? {}) },
	}, env, executionCtx);
}

afterEach(() => vi.unstubAllGlobals());

describe("rate limit settings reads", () => {
	it("rejects a workspace the user does not belong to", async () => {
		const requests = database({ role: null });
		const response = await call(`/rate-limits?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(403);
		expect(requests.some((request) => request.url.pathname.includes("rate_limit"))).toBe(false);
	});

	it("shows members that the page exists without reading policies", async () => {
		const requests = database({ role: "member" });
		const response = await call(`/rate-limits?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ workspaceId: WORKSPACE, canManageRateLimits: false, policies: [], assignments: [] });
		expect(requests.some((request) => request.url.pathname.includes("rate_limit"))).toBe(false);
	});

	it("returns policies, assignments, targets and throttles summed in the database for admins", async () => {
		const requests = database({ role: "admin" });
		const response = await call(`/rate-limits?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toContain("no-store");
		await expect(response.json()).resolves.toEqual({
			workspaceId: WORKSPACE,
			canManageRateLimits: true,
			policies: [{ id: POLICY, name: "Standard", description: null, requestsPerMinute: 60, tokensPerMinute: 200_000, concurrentRequests: null, failClosed: false, updatedAt: "2026-10-22T09:00:00Z" }],
			assignments: [
				{ id: "00000000-0000-4000-8000-0000000000d1", policyId: POLICY, targetType: "key", targetId: KEY },
				{ id: "00000000-0000-4000-8000-0000000000d2", policyId: POLICY, targetType: "department", targetId: DEPARTMENT },
				{ id: "00000000-0000-4000-8000-0000000000d3", policyId: POLICY, targetType: "end_user_default", targetId: null },
			],
			targets: {
				keys: [{ id: KEY, name: "Production", prefix: "abc123", status: "active" }],
				members: [{ id: "user-a", name: "Ada", role: "admin" }, { id: "user-b", name: null, role: "member" }],
				departments: [{ id: DEPARTMENT, name: "Engineering" }],
				guardrails: [],
			},
			throttles: [{ policyId: POLICY, throttledRequests: 12, lastThrottledAt: "2026-10-22T08:59:00+00:00" }],
			throttleWindowHours: 24,
			tier: null,
		});
		const rpc = requests.find((request) => request.url.pathname.endsWith("/rpc/workspace_rate_limit_throttle_summary"));
		expect(rpc?.body).toMatchObject({ p_workspace_id: WORKSPACE, p_since: expect.any(String) });
		const sinceHours = (Date.now() - Date.parse(rpc!.body.p_since)) / 3_600_000;
		expect(sinceHours).toBeGreaterThan(23.9);
		expect(sinceHours).toBeLessThan(24.1);
		// Every table read is scoped to the workspace.
		for (const request of requests.filter((entry) => entry.url.pathname.includes("/rest/v1/") && !entry.url.pathname.includes("/rpc/"))) {
			expect(request.url.searchParams.get("workspace_id") ?? request.url.searchParams.get("id")).toBe(`eq.${WORKSPACE}`);
		}
	});

	it("reports the page as unavailable when a read fails", async () => {
		database({ role: "owner", throttleError: true });
		expect((await call(`/rate-limits?workspaceId=${WORKSPACE}`)).status).toBe(503);
	});
});

describe("rate limit tier", () => {
	it("adds the gateway's tier and raise status to the admin view, with the session", async () => {
		const tier = { tier: "standard", requestsPerMinute: 25, target: "trusted", eligible: true, refusal: null, canRaise: true };
		const requests = database({ role: "owner", gateway: () => Response.json({ data: tier }) });
		const body = await (await call(`/rate-limits?workspaceId=${WORKSPACE}`)).json() as any;
		expect(body.tier).toEqual(tier);
		const forwarded = requests.find((request) => request.url.hostname === "gateway.test");
		expect(forwarded?.method).toBe("GET");
		expect(forwarded?.url.pathname).toBe("/v1/rate-limits/tier");
		expect(forwarded?.headers.get("x-phaseo-workspace-id")).toBe(WORKSPACE);
	});

	it("forwards a raise without a body and passes the gateway's refusal through", async () => {
		const requests = database({ gateway: () => Response.json({ error: "raise_unavailable", reason: "cooldown" }, { status: 409 }) });
		const response = await call("/rate-limits/tier/raise", { method: "POST", body: JSON.stringify({ workspaceId: WORKSPACE }) });
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toMatchObject({ error: "raise_unavailable", reason: "cooldown" });
		const forwarded = requests.find((request) => request.url.hostname === "gateway.test");
		expect([forwarded?.method, forwarded?.url.pathname, forwarded?.body]).toEqual(["POST", "/v1/rate-limits/tier/raise", null]);
	});
});

describe("rate limit settings writes", () => {
	it("forwards a new policy to the gateway with the session and workspace, without the workspaceId field", async () => {
		const requests = database({ gateway: () => Response.json({ data: { id: POLICY } }, { status: 201 }) });
		const response = await call("/rate-limits/policies", {
			method: "POST",
			body: JSON.stringify({ workspaceId: WORKSPACE, name: "Standard", requests_per_minute: 60 }),
		});
		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual({ ok: true, id: POLICY });
		const forwarded = requests.find((request) => request.url.hostname === "gateway.test");
		expect(forwarded?.url.pathname).toBe("/v1/rate-limits/policies");
		expect(forwarded?.method).toBe("POST");
		expect(forwarded?.body).toEqual({ name: "Standard", requests_per_minute: 60 });
		expect(forwarded?.headers.get("authorization")).toBe("Bearer fixture-token");
		expect(forwarded?.headers.get("x-phaseo-workspace-id")).toBe(WORKSPACE);
	});

	it("passes the gateway's validation and role errors through", async () => {
		database({ gateway: () => Response.json({ error: "conflict", message: "A policy with this name already exists" }, { status: 409 }) });
		const response = await call("/rate-limits/policies", { method: "POST", body: JSON.stringify({ workspaceId: WORKSPACE, name: "Standard", requests_per_minute: 1 }) });
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: "conflict", message: "A policy with this name already exists" });
	});

	it("updates and deletes assignments by id, and rejects malformed ids before forwarding", async () => {
		const requests = database({ gateway: (request) => Response.json({ data: { id: new URL(request.url).pathname.split("/").pop(), deleted: true } }) });
		const assignment = "00000000-0000-4000-8000-0000000000D1";
		expect((await call(`/rate-limits/assignments/${assignment}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, policy_id: POLICY }) })).status).toBe(200);
		expect((await call(`/rate-limits/assignments/${assignment}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(200);
		const forwarded = requests.filter((request) => request.url.hostname === "gateway.test");
		expect(forwarded.map((request) => [request.method, request.url.pathname, request.body])).toEqual([
			["PATCH", `/v1/rate-limits/assignments/${assignment.toLowerCase()}`, { policy_id: POLICY }],
			["DELETE", `/v1/rate-limits/assignments/${assignment.toLowerCase()}`, null],
		]);

		const before = requests.length;
		expect((await call("/rate-limits/policies/..%2Fkeys", { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(400);
		expect(requests.length).toBe(before);
	});

	it("needs a workspace before forwarding", async () => {
		const requests = database();
		expect((await call("/rate-limits/policies", { method: "POST", body: JSON.stringify({ name: "x", requests_per_minute: 1 }) })).status).toBe(400);
		expect(requests.some((request) => request.url.hostname === "gateway.test")).toBe(false);
	});
});
