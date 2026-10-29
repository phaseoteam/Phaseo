import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const RULE = "00000000-0000-4000-8000-0000000000d1";
const DEST = "00000000-0000-4000-8000-0000000000e1";
const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	KEY_PEPPER_ACTIVE: "pepper",
	GATEWAY_API_ORIGIN: "https://api.test",
	GATEWAY_INTERNAL_TEST_TOKEN: "internal-test-token-at-least-32-bytes",
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;

function row(overrides: Record<string, unknown> = {}) {
	return {
		id: RULE, workspace_id: WORKSPACE, name: "Monthly", enabled: true, metric: "budget_percent", scope_type: "workspace", scope_id: null,
		period: "month", window_hours: null, time_zone: null, base_kind: "amount", base_ref: null, base_amount_nanos: 100_000_000_000,
		threshold_percents: [50, 80, 100], threshold_amount_nanos: null, runway_days: null, spike_multiplier: null, spike_floor_nanos: null,
		action: "notify", block_at_percent: 110, block_at_amount_nanos: null, block_free_models: false, cooldown_minutes: 360,
		created_by: "user-a", created_at: "2026-10-21T12:00:00Z", updated_at: "2026-10-21T12:00:00Z", ...overrides,
	};
}

type Fixture = {
	role?: string | null;
	rules?: Array<Record<string, unknown>>;
	rpc?: (name: string, body: any) => Response;
	gateway?: (request: Request) => Response;
	/** Rows for other tables, by the last path segment (e.g. keys, workspace_departments). */
	tables?: Record<string, unknown[]>;
};

function database(fixture: Fixture = {}) {
	const requests: Array<{ url: URL; method: string; body: any; headers: Headers }> = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
		const body = text ? JSON.parse(text) : null;
		requests.push({ url, method: request.method, body, headers: request.headers });
		if (url.hostname === "api.test") return fixture.gateway ? fixture.gateway(request) : new Response("{}", { status: 500 });
		if (url.pathname.endsWith("/auth/v1/user")) return Response.json({ id: "user-a", email: "fixture@example.com", app_metadata: {} });
		const table = url.pathname.split("/").at(-1)!;
		const listingMembers = table === "workspace_members" && (url.searchParams.get("select") ?? "").includes("users(");
		if (fixture.tables && Object.hasOwn(fixture.tables, table) && (table !== "workspace_members" || listingMembers)) return Response.json(fixture.tables[table]);
		if (url.pathname.endsWith("/workspace_members")) return Response.json(fixture.role ? [{ role: fixture.role }] : []);
		if (url.pathname.endsWith("/workspaces")) return Response.json([{ owner_user_id: "owner", slug: "workspace-a", name: "Workspace A" }]);
		if (url.pathname.endsWith("/workspace_settings")) return Response.json([{ billing_time_zone: "Europe/London" }]);
		if (url.pathname.endsWith("/workspace_spend_rules")) {
			const rules = fixture.rules ?? [{ ...row(), workspace_spend_rule_destinations: [{ destination_id: DEST }] }];
			return Response.json(request.method === "PATCH" ? rules.map((rule) => ({ ...rule, deleted_at: "2026-10-21T13:00:00Z" })) : rules);
		}
		if (url.pathname.includes("/rpc/")) {
			const name = url.pathname.split("/").at(-1)!;
			if (fixture.rpc) return fixture.rpc(name, body);
			if (name === "save_workspace_spend_rule") return Response.json({ rule: { ...row(), ...body.p_rule, id: body.p_rule_id ?? RULE }, destination_ids: body.p_destination_ids ?? [DEST] });
			throw new Error(`Unexpected rpc ${name}`);
		}
		if (url.pathname.endsWith("/workspace_audit_events")) return new Response(null, { status: 201 });
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

const send = (path: string, method: string, body: Record<string, unknown>) => call(path, { method, body: JSON.stringify({ workspaceId: WORKSPACE, ...body }) });
const audits = (requests: ReturnType<typeof database>) => requests.filter((entry) => entry.url.pathname.endsWith("/workspace_audit_events")).map((entry) => entry.body);
const rpcCalls = (requests: ReturnType<typeof database>, name: string) => requests.filter((entry) => entry.url.pathname.endsWith(`/rpc/${name}`)).map((entry) => entry.body);

afterEach(() => vi.unstubAllGlobals());

describe("spend rule settings: reads", () => {
	it("rejects a workspace the user does not belong to", async () => {
		const requests = database({ role: null });
		expect((await call(`/spend-rules?workspaceId=${WORKSPACE}`)).status).toBe(403);
		expect(requests.some((entry) => entry.url.pathname.endsWith("/workspace_spend_rules"))).toBe(false);
	});

	it("lets members read the rules, with the billing zone and whether they can manage them", async () => {
		database({ role: "member" });
		const response = await call(`/spend-rules?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(await response.json()).toMatchObject({
			workspaceId: WORKSPACE, canManageSpendRules: false, maxRules: 50, testSendsPerMinute: 5, billingTimeZone: "Europe/London",
			rules: [{ id: RULE, base_amount_usd: 100, destination_ids: [DEST], evaluated: true }],
		});
	});

	it("gets one rule, its preview and its history for members", async () => {
		const requests = database({
			role: "member",
			rpc: (name) => name === "preview_workspace_spend_rule"
				? Response.json({ rule_id: RULE, metric: "budget_percent", evaluated: true, value_nanos: 59e9, base_nanos: 100e9, percent: 59, next_threshold: { percent: 80, amount_nanos: 80e9 } })
				: Response.json({ events: [{ id: "e1", kind: "spend_alert", created_at: "2026-10-21T12:00:00Z", value_nanos: 59e9, deliveries: { sent: 1, failed: 0, pending: 0 } }], has_more: false, periods: [] }),
		});
		expect(((await (await call(`/spend-rules/${RULE}?workspaceId=${WORKSPACE}`)).json()) as any).rule).toMatchObject({ id: RULE });
		expect(((await (await call(`/spend-rules/${RULE}/preview?workspaceId=${WORKSPACE}`)).json()) as any).preview).toMatchObject({ value_usd: 59, base_usd: 100, next_threshold: { amount_usd: 80 } });
		const history = await (await call(`/spend-rules/${RULE}/history?workspaceId=${WORKSPACE}&limit=10&offset=5`)).json() as any;
		expect(history.history).toMatchObject({ events: [{ id: "e1", value_usd: 59 }], has_more: false });
		expect(rpcCalls(requests, "list_workspace_spend_rule_history")).toEqual([{ p_workspace_id: WORKSPACE, p_rule_id: RULE, p_limit: 10, p_offset: 5 }]);
		expect((await call(`/spend-rules/${RULE}/history?workspaceId=${WORKSPACE}&limit=500`)).status).toBe(400);
	});

	it("is 404 for unknown rules", async () => {
		database({ role: "member", rules: [], rpc: () => Response.json({ code: "P0002", message: "spend_rule_not_found" }, { status: 400 }) });
		expect((await call(`/spend-rules/${RULE}?workspaceId=${WORKSPACE}`)).status).toBe(404);
		expect((await call(`/spend-rules/${RULE}/preview?workspaceId=${WORKSPACE}`)).status).toBe(404);
		expect((await call(`/spend-rules/${RULE}/history?workspaceId=${WORKSPACE}`)).status).toBe(404);
		expect((await call(`/spend-rules/not-a-uuid?workspaceId=${WORKSPACE}`)).status).toBe(400);
	});
});

describe("spend rule settings: editor options", () => {
	it("lists keys with their cost limits, members, departments, providers and budgets", async () => {
		const requests = database({
			role: "member",
			tables: {
				keys: [{ id: "k1", name: "prod", prefix: "sk-1", status: "active", daily_limit_cost_nanos: 0, weekly_limit_cost_nanos: null, monthly_limit_cost_nanos: 250_000_000_000 }],
				workspace_members: [{ user_id: "u1", role: "admin", users: { display_name: "Ada" } }, { user_id: "u2", role: "member", users: null }],
				workspace_departments: [{ id: "d1", name: "Research" }],
				v2_providers: [{ provider_slug: "openai", name: "OpenAI" }],
				workspace_budgets: [{ interval: "monthly", limit_nanos: 100_000_000_000 }],
			},
		});
		const response = await call(`/spend-rules/options?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(await response.json()).toEqual({
			workspaceId: WORKSPACE,
			keys: [{ id: "k1", name: "prod", prefix: "sk-1", status: "active", limitsUsd: { daily: null, weekly: null, monthly: 250 } }],
			members: [{ id: "u1", name: "Ada", role: "admin" }, { id: "u2", name: null, role: "member" }],
			departments: [{ id: "d1", name: "Research" }],
			providers: [{ id: "openai", name: "OpenAI" }],
			budgetsUsd: { monthly: 100 },
		});
		const keysRead = requests.find((entry) => entry.url.pathname.endsWith("/keys"))!;
		expect(keysRead.url.searchParams.get("workspace_id")).toBe(`eq.${WORKSPACE}`);
		expect(keysRead.url.searchParams.get("status")).toBe("neq.deleted");
	});

	it("rejects a workspace the user does not belong to", async () => {
		const requests = database({ role: null });
		expect((await call(`/spend-rules/options?workspaceId=${WORKSPACE}`)).status).toBe(403);
		expect(requests.some((entry) => entry.url.pathname.endsWith("/keys"))).toBe(false);
	});
});

describe("spend rule settings: writes", () => {
	it("keeps members out of every write", async () => {
		const requests = database({ role: "member" });
		for (const [path, method] of [["/spend-rules", "POST"], [`/spend-rules/${RULE}`, "PATCH"], [`/spend-rules/${RULE}`, "DELETE"], [`/spend-rules/${RULE}/test`, "POST"]] as const) {
			const response = await send(path, method, { name: "x" });
			expect(response.status).toBe(403);
		}
		expect(rpcCalls(requests, "save_workspace_spend_rule")).toEqual([]);
		expect(requests.some((entry) => entry.url.hostname === "api.test")).toBe(false);
	});

	it("validates with the shared rules before writing", async () => {
		const requests = database({ role: "admin" });
		const response = await send("/spend-rules", "POST", { name: "x", metric: "spend", period: "day" });
		expect(await response.json()).toEqual({ error: "bad_request", message: "threshold_amount_usd (or threshold_amount_nanos) is required for spend rules" });
		expect((await send("/spend-rules", "POST", { name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, time_zone: "Nowhere/Land" })).status).toBe(400);
		// A block rule is refused while the gateway does not enforce blocks (SPEND_RULE_BLOCKS_ENABLED off here).
		const block = await send("/spend-rules", "POST", { name: "x", metric: "spend", period: "day", threshold_amount_usd: 5, action: "block", block_at_amount_usd: 6 });
		expect(await block.json()).toEqual({ error: "bad_request", message: "action block is not available yet; use notify" });
		expect(rpcCalls(requests, "save_workspace_spend_rule")).toEqual([]);
	});

	it("creates a rule and its destinations in one call, audited", async () => {
		const requests = database({ role: "owner" });
		const response = await send("/spend-rules", "POST", { name: "Spike", metric: "spike", period: "rolling", window_hours: 6, destination_ids: [DEST] });
		expect(response.status).toBe(201);
		expect(((await response.json()) as any).rule).toMatchObject({ metric: "spike", evaluated: false, spike_multiplier: 3, spike_floor_usd: 5 });
		expect(rpcCalls(requests, "save_workspace_spend_rule")).toEqual([expect.objectContaining({
			p_workspace_id: WORKSPACE, p_rule_id: null, p_destination_ids: [DEST], p_actor_user_id: "user-a",
			p_rule: expect.objectContaining({ metric: "spike", spike_multiplier: 3, spike_floor_nanos: 5_000_000_000 }),
		})]);
		expect(audits(requests)).toEqual([expect.objectContaining({ action: "spend_rule.created", target_type: "spend_rule", actor_user_id: "user-a" })]);
	});

	it("maps database errors to 400 and 409", async () => {
		database({ role: "admin", rpc: () => Response.json({ code: "23514", message: "spend_rule_limit_reached" }, { status: 400 }) });
		const limited = await send("/spend-rules", "POST", { name: "x", metric: "spend", period: "day", threshold_amount_usd: 5 });
		expect(limited.status).toBe(409);
		expect(await limited.json()).toEqual({ error: "spend_rule_limit_reached", message: "A workspace can have at most 50 spend rules" });
		vi.unstubAllGlobals();
		database({ role: "admin", rpc: () => Response.json({ code: "23503", message: "notification_destination_not_found" }, { status: 400 }) });
		expect((await send("/spend-rules", "POST", { name: "x", metric: "spend", period: "day", threshold_amount_usd: 5 })).status).toBe(400);
	});

	it("merges updates over the stored rule and soft-deletes", async () => {
		const requests = database({ role: "admin" });
		const updated = await send(`/spend-rules/${RULE}`, "PATCH", { threshold_percents: [90] });
		expect(updated.status).toBe(200);
		expect(rpcCalls(requests, "save_workspace_spend_rule")[0]).toMatchObject({ p_rule_id: RULE, p_destination_ids: null, p_rule: { name: "Monthly", base_amount_nanos: 100e9, threshold_percents: [90] } });
		const deleted = await send(`/spend-rules/${RULE}`, "DELETE", {});
		expect(await deleted.json()).toEqual({ id: RULE, deleted: true });
		const patch = requests.find((entry) => entry.url.pathname.endsWith("/workspace_spend_rules") && entry.method === "PATCH");
		expect(patch?.body).toEqual({ deleted_at: expect.any(String) });
		expect(audits(requests).map((entry) => entry.action)).toEqual(["spend_rule.updated", "spend_rule.deleted"]);
	});

	it("sends tests through the gateway's internal endpoint and passes its limit through", async () => {
		const result = { rule_id: RULE, rule_name: "Monthly", test: true, title: "[TEST] x", message: "y", source: "rule", delivered: 1, failed: 0, deliveries: [] };
		const requests = database({ role: "admin", gateway: () => Response.json({ ok: true, result }) });
		const sent = await send(`/spend-rules/${RULE}/test`, "POST", {});
		expect(await sent.json()).toEqual({ result });
		const gateway = requests.find((entry) => entry.url.hostname === "api.test")!;
		expect(gateway.url.pathname).toBe("/internal/notification-tests/spend-rule");
		expect(gateway.headers.get("authorization")).toBe(`Bearer ${env.GATEWAY_INTERNAL_TEST_TOKEN}`);
		expect(gateway.body).toEqual({ workspaceId: WORKSPACE, ruleId: RULE });
		expect(audits(requests)).toEqual([expect.objectContaining({ action: "spend_rule.tested", target_name: "Monthly" })]);

		vi.unstubAllGlobals();
		database({ role: "admin", gateway: () => Response.json({ error: "rate_limited", message: "A workspace can send at most 5 spend rule tests a minute" }, { status: 429, headers: { "retry-after": "21" } }) });
		const limited = await send(`/spend-rules/${RULE}/test`, "POST", {});
		expect(limited.status).toBe(429);
		expect(limited.headers.get("retry-after")).toBe("21");
		expect(await limited.json()).toEqual({ error: "rate_limited", message: "A workspace can send at most 5 spend rule tests a minute" });
	});
});

describe("spend blocks", () => {
	const BLOCK = "00000000-0000-4000-8000-0000000000b1";
	const blockRow = (overrides: Record<string, unknown> = {}) => ({
		id: BLOCK, workspace_id: WORKSPACE, rule_id: RULE, rule_name: "Monthly", scope_type: "workspace", scope_id: null, scope_label: "Workspace A",
		block_free_models: false, period_start: "2026-10-01T00:00:00+00:00", resets_at: "2026-11-01T00:00:00+00:00",
		spend_nanos: 112_000_000_000, limit_nanos: 110_000_000_000, started_at: "2026-10-21T12:00:00+00:00",
		lifted_at: null, lifted_by: null, lift_reason: null, active: true, ...overrides,
	});

	it("lets members list active blocks, and says whether blocking is on", async () => {
		const requests = database({ role: "member", rpc: () => Response.json([blockRow()]) });
		const response = await call(`/spend-rules/blocks?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ workspaceId: WORKSPACE, canLift: false, blocks: [{ id: BLOCK, spend_usd: 112, limit_usd: 110, active: true }] });
		expect(rpcCalls(requests, "list_workspace_spend_blocks")).toEqual([{ p_workspace_id: WORKSPACE, p_include_lifted: false, p_limit: 50 }]);
		expect((await call(`/spend-rules/blocks?workspaceId=${WORKSPACE}&includeLifted=nope`)).status).toBe(400);
		expect(((await (await call(`/spend-rules?workspaceId=${WORKSPACE}`)).json()) as any).blocksEnabled).toBe(false);
		const enabled = await app.request(`https://phaseo.app/api/account/settings/spend-rules?workspaceId=${WORKSPACE}`, {
			headers: { authorization: "Bearer fixture-token" },
		}, { ...env, SPEND_RULE_BLOCKS_ENABLED: "true" }, executionCtx);
		expect(((await enabled.json()) as any).blocksEnabled).toBe(true);
	});

	it("only lets owners and admins lift a block", async () => {
		const requests = database({ role: "member" });
		expect((await send(`/spend-rules/blocks/${BLOCK}/lift`, "POST", {})).status).toBe(403);
		expect(rpcCalls(requests, "lift_workspace_spend_block")).toEqual([]);
	});

	it("lifts a block, audits it and asks the gateway to republish", async () => {
		const requests = database({
			role: "admin",
			rpc: () => Response.json(blockRow({ lifted_at: "2026-10-21T13:00:00+00:00", lift_reason: "manual", lifted_by: "user-a", active: false })),
			gateway: () => Response.json({ ok: true, published: true, enabled: true }),
		});
		const response = await send(`/spend-rules/blocks/${BLOCK}/lift`, "POST", {});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ block: { id: BLOCK, lift_reason: "manual", active: false } });
		expect(rpcCalls(requests, "lift_workspace_spend_block")).toEqual([{ p_workspace_id: WORKSPACE, p_block_id: BLOCK, p_actor_user_id: "user-a" }]);
		expect(audits(requests)).toEqual([expect.objectContaining({ action: "spend_block.lifted", target_type: "spend_block", target_id: BLOCK })]);
		const publish = requests.find((entry) => entry.url.hostname === "api.test");
		expect(publish?.url.pathname).toBe("/internal/spend-blocks/publish");
		expect(publish?.body).toEqual({ workspaceId: WORKSPACE });
		expect(publish?.headers.get("authorization")).toBe(`Bearer ${env.GATEWAY_INTERNAL_TEST_TOKEN}`);
	});

	it("still answers when the gateway republish fails", async () => {
		database({ role: "owner", rpc: () => Response.json(blockRow({ lifted_at: "2026-10-21T13:00:00+00:00", lift_reason: "manual", active: false })) });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect((await send(`/spend-rules/blocks/${BLOCK}/lift`, "POST", {})).status).toBe(200);
		expect(warn).toHaveBeenCalledWith("spend_block_publish_failed", expect.anything());
		warn.mockRestore();
	});

	it("maps lift errors", async () => {
		database({ role: "admin", rpc: () => Response.json({ code: "P0002", message: "spend_block_not_found" }, { status: 400 }) });
		expect((await send(`/spend-rules/blocks/${BLOCK}/lift`, "POST", {})).status).toBe(404);
		vi.unstubAllGlobals();
		database({ role: "admin", rpc: () => Response.json({ code: "55000", message: "spend_block_not_active" }, { status: 400 }) });
		const conflict = await send(`/spend-rules/blocks/${BLOCK}/lift`, "POST", {});
		expect(conflict.status).toBe(409);
		expect(await conflict.json()).toMatchObject({ error: "spend_block_not_active" });
		expect((await send("/spend-rules/blocks/nope/lift", "POST", {})).status).toBe(400);
	});

	it("republishes after a block rule is changed or deleted, not after a notify rule changes", async () => {
		const requests = database({ role: "admin", gateway: () => Response.json({ ok: true }) });
		expect((await send(`/spend-rules/${RULE}`, "PATCH", { name: "Renamed" })).status).toBe(200);
		expect(requests.filter((entry) => entry.url.hostname === "api.test")).toHaveLength(0);
		vi.unstubAllGlobals();
		const blockRequests = database({
			role: "admin",
			rules: [{ ...row({ action: "block", metric: "spend", base_kind: null, base_amount_nanos: null, threshold_percents: null, threshold_amount_nanos: 100e9, block_at_amount_nanos: 110e9 }), workspace_spend_rule_destinations: [] }],
			rpc: (name, body) => Response.json({ rule: { ...row({ action: "block", metric: "spend", base_kind: null, base_amount_nanos: null, threshold_percents: null, threshold_amount_nanos: 100e9, block_at_amount_nanos: 110e9 }), ...body.p_rule }, destination_ids: [] }),
			gateway: () => Response.json({ ok: true }),
		});
		expect((await send(`/spend-rules/${RULE}`, "PATCH", { enabled: false })).status).toBe(200);
		expect((await send(`/spend-rules/${RULE}`, "DELETE", {})).status).toBe(200);
		expect(blockRequests.filter((entry) => entry.url.pathname === "/internal/spend-blocks/publish")).toHaveLength(2);
	});
});
