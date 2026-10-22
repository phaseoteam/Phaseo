import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const BUDGET_ID = "00000000-0000-4000-8000-0000000000b1";
const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	PHASEO_CONTROL_KEY: "control-key",
	PHASEO_CONTROL_SECRET: "control-secret",
	GATEWAY_API_ORIGIN: "https://gateway.test",
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;

function row(overrides: Record<string, unknown> = {}) {
	return {
		id: BUDGET_ID, workspace_id: WORKSPACE, interval: "monthly", limit_nanos: 50_000_000_000,
		created_by: "user-a", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...overrides,
	};
}

type Fixture = {
	role?: string | null;
	owner?: boolean;
	writeError?: { code: string; message: string } | null;
	noRow?: boolean;
	statusError?: boolean;
	budgets?: Array<Record<string, unknown>>;
};

function database(fixture: Fixture = {}) {
	const requests: Array<{ url: URL; method: string; body: any; headers: Headers }> = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
		requests.push({ url, method: request.method, body: text ? JSON.parse(text) : null, headers: request.headers });
		if (url.hostname === "gateway.test") return new Response(null, { status: 204 });
		if (url.pathname.endsWith("/auth/v1/user")) return Response.json({ id: "user-a", email: "fixture@example.com" });
		if (url.pathname.endsWith("/workspace_members")) return Response.json(fixture.role ? [{ role: fixture.role }] : []);
		if (url.pathname.endsWith("/workspaces")) return Response.json([{ owner_user_id: fixture.owner ? "user-a" : "owner", slug: "workspace-a", name: "Workspace A" }]);
		if (url.pathname.endsWith("/rpc/gateway_workspace_budget_status")) {
			if (fixture.statusError) return Response.json({ code: "XX000", message: "boom" }, { status: 500 });
			return Response.json({
				ok: true,
				now: "2026-10-21T12:00:00Z",
				budgets: fixture.budgets ?? [
					{ ...row({ id: "00000000-0000-4000-8000-0000000000b2", interval: "lifetime", limit_nanos: 100_000_000_000 }), usage_nanos: 0, window_start: null, reset_at: null },
					{ ...row(), usage_nanos: 40_000_000_000, window_start: "2026-10-01T00:00:00Z", reset_at: "2026-11-01T00:00:00Z" },
				],
			});
		}
		if (url.pathname.endsWith("/workspace_budgets")) {
			if (fixture.writeError) return Response.json(fixture.writeError, { status: 409 });
			if (fixture.noRow) return Response.json([]);
			const patch = request.method === "PATCH" ? JSON.parse(text) : {};
			return Response.json([row(request.method === "POST" ? JSON.parse(text) : patch)]);
		}
		if (url.pathname.endsWith("/workspace_audit_events")) return new Response(null, { status: 201 });
		if (url.pathname.endsWith("/keys")) return Response.json([{ id: "key-1" }, { id: "key-2" }]);
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

const budgetWrites = (requests: ReturnType<typeof database>) =>
	requests.filter((entry) => entry.url.pathname.endsWith("/workspace_budgets") && entry.method !== "GET");
const invalidations = (requests: ReturnType<typeof database>) =>
	requests.filter((entry) => entry.url.hostname === "gateway.test").map((entry) => entry.url.pathname);

afterEach(() => vi.unstubAllGlobals());

describe("workspace budget settings reads", () => {
	it("rejects a workspace the user does not belong to without reading budgets", async () => {
		const requests = database({ role: null });
		const response = await call(`/budgets?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(403);
		expect(requests.some((entry) => entry.url.pathname.includes("gateway_workspace_budget_status"))).toBe(false);
	});

	it("lists budgets shortest window first, with usage from the enforcement function", async () => {
		const requests = database({ role: "member" });
		const response = await call(`/budgets?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		const body = await response.json() as any;
		expect(body).toMatchObject({ workspaceId: WORKSPACE, canManageBudgets: false, observedAt: "2026-10-21T12:00:00Z" });
		expect(body.budgets.map((budget: any) => budget.interval)).toEqual(["monthly", "lifetime"]);
		expect(body.budgets[0]).toMatchObject({
			id: BUDGET_ID, limit_usd: 50, usage_usd: 40, remaining_nanos: 10_000_000_000,
			percent_used: 80, exceeded: false, reset_at: "2026-11-01T00:00:00Z",
		});
		const rpc = requests.find((entry) => entry.url.pathname.endsWith("/rpc/gateway_workspace_budget_status"))!;
		expect(rpc.body).toEqual({ p_workspace_id: WORKSPACE, p_requested_amount_nanos: 0 });
		// Aggregated in SQL: the page never reads requests to sum them.
		expect(requests.some((entry) => entry.url.pathname.endsWith("/gateway_requests"))).toBe(false);
	});

	it("lets owners and admins manage", async () => {
		database({ role: "admin" });
		expect((await (await call(`/budgets?workspaceId=${WORKSPACE}`)).json() as any).canManageBudgets).toBe(true);
		database({ role: "member", owner: true });
		expect((await (await call(`/budgets?workspaceId=${WORKSPACE}`)).json() as any).canManageBudgets).toBe(true);
	});

	it("marks a used-up budget as exceeded", async () => {
		database({ role: "admin", budgets: [{ ...row({ interval: "daily", limit_nanos: 1_000_000_000 }), usage_nanos: 1_200_000_000 }] });
		const body = await (await call(`/budgets?workspaceId=${WORKSPACE}`)).json() as any;
		expect(body.budgets[0]).toMatchObject({ exceeded: true, remaining_nanos: 0, percent_used: 120 });
	});

	it("returns 503 when usage cannot be read", async () => {
		database({ role: "admin", statusError: true });
		expect((await call(`/budgets?workspaceId=${WORKSPACE}`)).status).toBe(503);
	});
});

describe("workspace budget settings writes", () => {
	it("rejects members", async () => {
		const requests = database({ role: "member" });
		const response = await call("/budgets", { method: "POST", body: JSON.stringify({ workspaceId: WORKSPACE, interval: "daily", limit: 10 }) });
		expect(response.status).toBe(403);
		expect(budgetWrites(requests)).toHaveLength(0);
	});

	it.each([
		[{ interval: "hourly", limit: 10 }, "interval must be daily, weekly, monthly, or lifetime"],
		[{ interval: "daily", limit: 0 }, "limit must be a positive USD amount"],
		[{ interval: "daily", limit: "" }, "limit must be a positive USD amount"],
		[{ interval: "daily", limit: true }, "limit must be a positive USD amount"],
		[{ interval: "daily", limit: 1e12 }, "limit must be a positive USD amount"],
	])("validates %j with the shared rules before writing", async (input, message) => {
		const requests = database({ role: "admin" });
		const response = await call("/budgets", { method: "POST", body: JSON.stringify({ workspaceId: WORKSPACE, ...input }) });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "bad_request", message });
		expect(budgetWrites(requests)).toHaveLength(0);
	});

	it("creates a budget in nanos, audits it and invalidates every key", async () => {
		const requests = database({ role: "admin" });
		const response = await call("/budgets", { method: "POST", body: JSON.stringify({ workspaceId: WORKSPACE, interval: " Monthly ", limit: "12.5" }) });
		expect(response.status).toBe(201);
		const insert = budgetWrites(requests)[0]!;
		expect(insert.method).toBe("POST");
		expect(insert.body).toEqual({ workspace_id: WORKSPACE, interval: "monthly", limit_nanos: 12_500_000_000, created_by: "user-a" });
		const auditEvent = requests.find((entry) => entry.url.pathname.endsWith("/workspace_audit_events"))!;
		expect(auditEvent.body).toMatchObject({ action: "workspace_budget.created", target_type: "workspace_budget", target_name: "monthly", metadata: { interval: "monthly", limit_nanos: 12_500_000_000 } });
		expect(invalidations(requests)).toEqual(["/v1/keys/key-1/invalidate", "/v1/keys/key-2/invalidate"]);
		expect(await response.json()).toMatchObject({ gatewayCacheInvalidated: true, budget: { interval: "monthly", usage_usd: 40 } });
	});

	it("returns 409 when the interval already has a budget", async () => {
		const requests = database({ role: "admin", writeError: { code: "23505", message: "duplicate" } });
		const response = await call("/budgets", { method: "POST", body: JSON.stringify({ workspaceId: WORKSPACE, interval: "daily", limit: 10 }) });
		expect(response.status).toBe(409);
		expect(invalidations(requests)).toHaveLength(0);
	});

	it("updates the limit of the workspace's own budget", async () => {
		const requests = database({ role: "owner" });
		const response = await call(`/budgets/${BUDGET_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, limit: 75 }) });
		expect(response.status).toBe(200);
		const update = budgetWrites(requests)[0]!;
		expect(update.method).toBe("PATCH");
		expect(update.body).toMatchObject({ limit_nanos: 75_000_000_000 });
		expect(update.body.interval).toBeUndefined();
		expect(update.url.searchParams.get("workspace_id")).toBe(`eq.${WORKSPACE}`);
		expect(update.url.searchParams.get("id")).toBe(`eq.${BUDGET_ID}`);
		expect(requests.find((entry) => entry.url.pathname.endsWith("/workspace_audit_events"))!.body.action).toBe("workspace_budget.updated");
		expect(invalidations(requests)).toHaveLength(2);
	});

	it("requires a change and a valid id", async () => {
		database({ role: "admin" });
		expect((await call(`/budgets/${BUDGET_ID}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(400);
		expect((await call("/budgets/not-a-uuid", { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, limit: 5 }) })).status).toBe(400);
	});

	it("returns 404 for a budget in another workspace", async () => {
		const requests = database({ role: "admin", noRow: true });
		const response = await call(`/budgets/${BUDGET_ID}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) });
		expect(response.status).toBe(404);
		expect(invalidations(requests)).toHaveLength(0);
	});

	it("deletes, audits and invalidates", async () => {
		const requests = database({ role: "admin" });
		const response = await call(`/budgets/${BUDGET_ID}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ deleted: true, id: BUDGET_ID, gatewayCacheInvalidated: true });
		expect(budgetWrites(requests)[0]!.method).toBe("DELETE");
		expect(requests.find((entry) => entry.url.pathname.endsWith("/workspace_audit_events"))!.body.action).toBe("workspace_budget.deleted");
		expect(invalidations(requests)).toHaveLength(2);
	});

	it("still saves when the gateway cannot be told", async () => {
		const requests = database({ role: "admin" });
		const response = await app.request("https://phaseo.app/api/account/settings/budgets", {
			method: "POST",
			headers: { authorization: "Bearer fixture-token", "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: WORKSPACE, interval: "weekly", limit: 20 }),
		}, { ...env, PHASEO_CONTROL_KEY: undefined, PHASEO_CONTROL_SECRET: undefined }, executionCtx);
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({ gatewayCacheInvalidated: false });
		expect(budgetWrites(requests)).toHaveLength(1);
	});
});
