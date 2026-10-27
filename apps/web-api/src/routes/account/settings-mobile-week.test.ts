import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key" };
const workspaceId = "10000000-0000-4000-8000-000000000001";
const base = "https://phaseo.app/api/account/settings/mobile-notifications/week";

// What get_mobile_week_summary returns for one workspace's week.
const summary = {
	week: "2026-W43", timeZone: "Europe/London", from: "2026-10-18T23:00:00Z", to: "2026-10-26T00:00:00Z", weekEnd: "2026-10-26T00:00:00Z", complete: true,
	workspace: { id: workspaceId, name: "Acme" },
	totals: { spend: 26, requests: 31, successfulRequests: 29, successRate: 0.9355, inputTokens: 3100000, outputTokens: 620000, tokens: 3720000 },
	previous: { from: "2026-10-11T23:00:00Z", to: "2026-10-18T23:00:00Z", spend: 27, requests: 11, successfulRequests: 11, successRate: 1, inputTokens: 1100000, outputTokens: 220000, tokens: 1320000 },
	change: { spend: -0.037, requests: 1.8182 },
	days: ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].map((date) => ({ date, spend: 1, requests: 1, inputTokens: 1, outputTokens: 1, tokens: 2 })),
	topModels: [{ modelId: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", spend: 21, requests: 21 }],
	releases: { matching: "rules", count: 1, items: [{ modelId: "openai/gpt-6-astra", name: "GPT-6 Astra", labId: "openai", labName: "OpenAI", kind: "model_released", occurredAt: "2026-10-20T10:00:00Z", href: "/models/openai/gpt-6-astra" }] },
};

type Backend = {
	user?: { id: string } | null;
	role?: string | null;
	owner?: string;
	rpc?: () => Response;
};

function stubBackend(backend: Backend = {}) {
	const rpcCalls: Array<Record<string, unknown>> = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		if (url.pathname === "/auth/v1/user") {
			return backend.user === null ? Response.json({ message: "invalid token" }, { status: 401 }) : Response.json(backend.user ?? { id: "viewer" });
		}
		if (url.pathname.endsWith("/workspace_members")) return Response.json(backend.role ? [{ role: backend.role }] : []);
		if (url.pathname.endsWith("/workspaces")) return Response.json([{ owner_user_id: backend.owner ?? "someone-else", slug: "acme", name: "Acme", logo_url: null }]);
		if (url.pathname.endsWith("/rpc/get_mobile_week_summary")) {
			rpcCalls.push(JSON.parse(String(init?.body ?? "{}")));
			return backend.rpc ? backend.rpc() : Response.json(summary);
		}
		throw new Error(`unexpected request ${url.pathname}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	return { rpcCalls, fetchMock };
}

const get = (query: string, headers: Record<string, string> = { authorization: "Bearer token" }) => app.request(`${base}${query}`, { headers }, env);

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/account/settings/mobile-notifications/week", () => {
	it("needs a signed-in user", async () => {
		const { rpcCalls } = stubBackend({ user: null });
		const response = await get(`?workspaceId=${workspaceId}`);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ error: "unauthorized" });
		expect(rpcCalls).toHaveLength(0);
	});

	it("is refused to someone outside the workspace, before any usage is read", async () => {
		const { rpcCalls } = stubBackend({ role: null });
		const response = await get(`?workspaceId=${workspaceId}&week=2026-W43`);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "forbidden" });
		expect(rpcCalls).toHaveLength(0);
	});

	it("returns the week a member asks for, summed by one database call", async () => {
		const { rpcCalls } = stubBackend({ role: "member" });
		const response = await get(`?workspaceId=${workspaceId.toUpperCase()}&week=2026-W43&timeZone=Europe/London`);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(rpcCalls).toEqual([{ p_user_id: "viewer", p_workspace_id: workspaceId, p_week: "2026-W43", p_time_zone: "Europe/London" }]);
		const body = await response.json() as typeof summary;
		expect(body).toEqual(summary);
		expect(Object.keys(body).sort()).toEqual(["change", "complete", "days", "from", "previous", "releases", "timeZone", "to", "topModels", "totals", "week", "weekEnd", "workspace"]);
		expect(body.days).toHaveLength(7);
	});

	it("lets the owner in without a member row, and takes the app's own link parameters", async () => {
		const { rpcCalls } = stubBackend({ role: null, owner: "viewer" });
		const response = await get(`?workspace=${workspaceId}&week=2026-w43`);
		expect(response.status).toBe(200);
		// No time zone: the database uses the user's latest device, else UTC.
		expect(rpcCalls).toEqual([{ p_user_id: "viewer", p_workspace_id: workspaceId, p_week: "2026-W43", p_time_zone: null }]);
	});

	it("defaults to the current week", async () => {
		const { rpcCalls } = stubBackend({ role: "admin" });
		expect((await get(`?workspaceId=${workspaceId}`)).status).toBe(200);
		expect(rpcCalls[0]).toMatchObject({ p_week: null, p_time_zone: null });
	});

	it("rejects bad parameters without reading anything", async () => {
		const { fetchMock } = stubBackend({ role: "member" });
		for (const [query, error] of [
			["", "workspace_required"],
			["?workspaceId=acme", "invalid_workspace"],
			[`?workspaceId=${workspaceId}&week=2026-43`, "invalid_week"],
			[`?workspaceId=${workspaceId}&week=2026-W54`, "invalid_week"],
			[`?workspaceId=${workspaceId}&timeZone=Mars/Olympus_Mons`, "invalid_time_zone"],
		] as const) {
			const response = await get(query);
			expect(response.status, query).toBe(400);
			expect(await response.json(), query).toMatchObject({ error });
		}
		expect(fetchMock.mock.calls.every(([input]) => new URL(String(input instanceof Request ? input.url : input)).pathname === "/auth/v1/user")).toBe(true);
	});

	it("answers a week that does not exist, a zone the database does not know, and outages", async () => {
		stubBackend({ role: "member", rpc: () => new Response("null", { status: 200, headers: { "content-type": "application/json" } }) });
		const missing = await get(`?workspaceId=${workspaceId}&week=2025-W53`);
		expect(missing.status).toBe(400);
		expect(await missing.json()).toMatchObject({ error: "invalid_week" });

		stubBackend({ role: "member", rpc: () => Response.json({ code: "22023", message: 'time zone "America/Ciudad_Juarez" not recognized' }, { status: 400 }) });
		const zone = await get(`?workspaceId=${workspaceId}&timeZone=America/Ciudad_Juarez`);
		expect(zone.status).toBe(400);
		expect(await zone.json()).toMatchObject({ error: "invalid_time_zone" });

		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			stubBackend({ role: "member", rpc: () => Response.json({ code: "57014", message: "canceling statement due to statement timeout" }, { status: 500 }) });
			const outage = await get(`?workspaceId=${workspaceId}`);
			expect(outage.status).toBe(503);
			expect(await outage.json()).toMatchObject({ error: "week_summary_unavailable" });
		} finally {
			errors.mockRestore();
		}
	});
});
