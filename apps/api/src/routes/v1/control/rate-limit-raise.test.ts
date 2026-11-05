import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	session: null as unknown,
	management: null as unknown,
	oauthRole: null as string | null,
	bindings: {} as Record<string, string>,
	inputs: null as Record<string, unknown> | null,
	lastRaise: null as { created_at: string } | null,
	inserts: [] as Array<Record<string, unknown>>,
	audits: [] as Array<Record<string, unknown>>,
	published: [] as Array<Record<string, unknown>>,
	publishError: null as Error | null,
	readErrorAfterInsert: null as Error | null,
	/** A raise another request recorded between this request's read and its insert. */
	raceRaise: null as { created_at: string } | null,
}));

vi.mock("./dashboard-session", () => ({ authenticateDashboardSession: async () => mocks.session, workspaceRole: async () => mocks.oauthRole }));
vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: async () => mocks.management
		? { ok: true, value: mocks.management }
		: { ok: false, response: new Response(JSON.stringify({ error: "unauthorised" }), { status: 401 }) },
}));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: async (_client: unknown, event: Record<string, unknown>) => { mocks.audits.push(event); } }));
vi.mock("@core/customer-rate-limit-tiers", () => ({
	readCustomerRateLimitInputs: async () => {
		if (mocks.readErrorAfterInsert && mocks.inserts.length > 0) throw mocks.readErrorAfterInsert;
		return mocks.inputs;
	},
	publishCustomerRateLimitTier: async (inputs: Record<string, unknown>) => {
		if (mocks.publishError) throw mocks.publishError;
		mocks.published.push(inputs);
	},
}));
vi.mock("@/runtime/env", () => ({
	getBindings: () => mocks.bindings,
	getSupabaseAdmin: () => ({
		rpc: async (name: string, args: Record<string, any>) => {
			if (name !== "request_workspace_rate_limit_raise") throw new Error(name);
			if (mocks.raceRaise) mocks.lastRaise = mocks.raceRaise;
			// The function inserts only if the caller saw the newest raise.
			if ((mocks.lastRaise?.created_at ?? null) !== args.p_last_requested_at) return { data: [], error: null };
			const row = { workspace_id: args.p_workspace_id, from_tier: args.p_from_tier, to_tier: args.p_to_tier, requested_by: args.p_requested_by, expires_at: args.p_expires_at };
			mocks.inserts.push(row);
			// Once inserted, the inputs carry the raise, as the SQL function would.
			mocks.inputs = { ...mocks.inputs, raise_tier: row.to_tier, raise_expires_at: row.expires_at };
			mocks.lastRaise = { created_at: new Date().toISOString() };
			return { data: [{ id: "raise-1", from_tier: row.from_tier, to_tier: row.to_tier, expires_at: row.expires_at }], error: null };
		},
		from: () => {
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				order: () => builder,
				limit: () => builder,
				maybeSingle: async () => ({ data: mocks.lastRaise, error: null }),
			};
			return builder;
		},
	}),
}));

import { handleGetRateLimitTier, handleRaiseRateLimitTier } from "./rate-limit-raise";

const DAY = 86_400_000;
const WS = "00000000-0000-4000-8000-000000000001";
const session = (role: string) => ({ role, auth: { workspaceId: WS, userId: "user-1" } });
const request = (method = "GET") => new Request("https://api.phaseo.test/v1/rate-limits/tier", { method });

beforeEach(() => {
	mocks.session = session("owner");
	mocks.management = null;
	mocks.oauthRole = null;
	mocks.bindings = { CUSTOMER_RATE_LIMIT_LADDER_ENABLED: "true", CUSTOMER_RATE_LIMIT_SELF_SERVE_RAISES_ENABLED: "true" };
	mocks.inputs = {
		workspace_id: WS, created_at: new Date(Date.now() - 10 * DAY).toISOString(), billing_mode: "wallet", has_paid_top_up: true,
		lifetime_paid_spend_nanos: "20000000000", override_requests_per_minute: null, override_free_requests_per_day: null,
		override_expires_at: null, raise_tier: null, raise_expires_at: null,
	};
	mocks.lastRaise = null;
	mocks.inserts.length = 0;
	mocks.audits.length = 0;
	mocks.published.length = 0;
	mocks.publishError = null;
	mocks.readErrorAfterInsert = null;
	mocks.raceRaise = null;
});

afterEach(() => vi.restoreAllMocks());

describe("self-serve rate limit raise routes", () => {
	it("refuses unauthenticated callers", async () => {
		mocks.session = null;
		expect((await handleRaiseRateLimitTier(request("POST"))).status).toBe(401);
		expect(mocks.inserts).toHaveLength(0);
	});

	it("lets a management key read the tier but never raise", async () => {
		mocks.session = null;
		mocks.management = { workspaceId: WS, authMethod: "api_key", scopes: ["rate_limits:read", "rate_limits:write"] };
		const view = await (await handleGetRateLimitTier(request())).json() as any;
		expect(view.data).toMatchObject({ tier: "standard", eligible: true, canRaise: false });
		expect((await handleRaiseRateLimitTier(request("POST"))).status).toBe(403);
		expect(mocks.inserts).toHaveLength(0);
	});

	it("requires the rate limit scopes for OAuth tokens", async () => {
		mocks.session = null;
		mocks.oauthRole = "owner";
		mocks.management = { workspaceId: WS, authMethod: "oauth", oauthClientId: "phaseo_cli", userId: "user-1", oauthScopes: ["rate_limits:read"] };
		expect((await handleGetRateLimitTier(request())).status).toBe(200);
		const response = await handleRaiseRateLimitTier(request("POST"));
		expect(response.status).toBe(403);
		expect((await response.json() as any).error).toBe("insufficient_scope");
		expect(mocks.inserts).toHaveLength(0);
	});

	it("lets the workspace owner raise with an OAuth token, and refuses admins and members", async () => {
		mocks.session = null;
		mocks.management = { workspaceId: WS, authMethod: "oauth", oauthClientId: "phaseo_cli", userId: "user-1", oauthScopes: ["rate_limits:read", "rate_limits:write"] };
		mocks.oauthRole = "member";
		expect((await handleGetRateLimitTier(request())).status).toBe(403);
		mocks.oauthRole = "admin";
		expect((await handleRaiseRateLimitTier(request("POST"))).status).toBe(403);
		expect(mocks.inserts).toHaveLength(0);
		mocks.oauthRole = "owner";
		expect((await handleRaiseRateLimitTier(request("POST"))).status).toBe(201);
		expect(mocks.inserts).toEqual([expect.objectContaining({ requested_by: "user-1" })]);
		expect(mocks.audits).toEqual([expect.objectContaining({ actorUserId: "user-1", action: "rate_limit_raise.requested" })]);
	});

	it("shows owners and admins the tier, and only the owner can raise", async () => {
		mocks.session = session("admin");
		const view = await (await handleGetRateLimitTier(request())).json() as any;
		expect(view.data).toMatchObject({ tier: "standard", requestsPerMinute: 25, target: "trusted", eligible: true, canRaise: false });
		expect((await handleRaiseRateLimitTier(request("POST"))).status).toBe(403);
		mocks.session = session("member");
		expect((await handleGetRateLimitTier(request())).status).toBe(403);
		expect(mocks.inserts).toHaveLength(0);
	});

	it("raises an eligible workspace for the configured time, audits it and publishes it at once", async () => {
		const before = Date.now();
		const response = await handleRaiseRateLimitTier(request("POST"));
		expect(response.status).toBe(201);
		expect(mocks.inserts).toEqual([{ workspace_id: WS, from_tier: "standard", to_tier: "trusted", requested_by: "user-1", expires_at: expect.any(String) }]);
		const expiresAt = Date.parse(mocks.inserts[0].expires_at as string);
		expect(expiresAt - before).toBeGreaterThanOrEqual(30 * DAY - 1000);
		expect(expiresAt - before).toBeLessThanOrEqual(30 * DAY + 1000);
		expect(mocks.audits).toEqual([expect.objectContaining({
			workspaceId: WS, actorUserId: "user-1", action: "rate_limit_raise.requested", targetType: "workspace_rate_limit_raise",
			metadata: expect.objectContaining({ from_tier: "standard", to_tier: "trusted", requests_per_minute: 60 }),
		})]);
		expect(mocks.published).toHaveLength(1);
		const body = await response.json() as any;
		expect(body.data).toMatchObject({ tier: "trusted", requestsPerMinute: 60, eligible: false, refusal: "raised", canRaise: false });
	});

	it.each([
		["the switch is off", () => { mocks.bindings.CUSTOMER_RATE_LIMIT_SELF_SERVE_RAISES_ENABLED = "false"; }, "disabled"],
		["the ladder is off", () => { mocks.bindings.CUSTOMER_RATE_LIMIT_LADDER_ENABLED = "false"; }, "disabled"],
		["the workspace never paid", () => { mocks.inputs!.has_paid_top_up = false; }, "no_paid_top_up"],
		["a raise was requested in the cooldown", () => { mocks.lastRaise = { created_at: new Date(Date.now() - 10 * DAY).toISOString() }; }, "cooldown"],
	])("refuses with 409 when %s", async (_label, arrange, reason) => {
		arrange();
		const response = await handleRaiseRateLimitTier(request("POST"));
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: "raise_unavailable", reason });
		expect(mocks.inserts).toHaveLength(0);
		expect(mocks.audits).toHaveLength(0);
	});

	it("keeps the raise when publishing fails; the scheduled publisher applies it", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		mocks.publishError = new Error("kv down");
		const response = await handleRaiseRateLimitTier(request("POST"));
		expect(response.status).toBe(201);
		expect(mocks.inserts).toHaveLength(1);
	});

	it("refuses with 409 when a concurrent request recorded a raise first", async () => {
		mocks.raceRaise = { created_at: new Date().toISOString() };
		const response = await handleRaiseRateLimitTier(request("POST"));
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: "raise_unavailable", reason: "raised" });
		expect(mocks.inserts).toHaveLength(0);
		expect(mocks.audits).toHaveLength(0);
		expect(mocks.published).toHaveLength(0);
	});

	it("reports the saved raise when reading the workspace again fails", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		mocks.readErrorAfterInsert = new Error("postgres down");
		const response = await handleRaiseRateLimitTier(request("POST"));
		expect(response.status).toBe(201);
		expect(mocks.inserts).toHaveLength(1);
		expect(mocks.published).toHaveLength(0);
		const body = await response.json() as any;
		expect(body.data).toMatchObject({ tier: "trusted", requestsPerMinute: 60, eligible: false, refusal: "raised", canRaise: false });
		expect(body.data.activeUntil).toBe(Date.parse(mocks.inserts[0].expires_at as string));
	});
});
