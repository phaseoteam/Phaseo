import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	store: new Map<string, string>(),
	failGet: false,
	failPut: false,
	tables: {} as Record<string, Array<Record<string, unknown>>>,
	selectError: null as { message: string } | null,
	inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
	bindings: {} as Record<string, unknown>,
	admit: vi.fn(),
	getByName: vi.fn(),
	background: [] as Promise<unknown>[],
}));

function query(table: string) {
	const filters: Array<(row: Record<string, unknown>) => boolean> = [];
	let range: [number, number] | null = null;
	const run = () => {
		if (mocks.selectError) return { data: null, error: mocks.selectError };
		const rows = (mocks.tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
		return { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null };
	};
	const builder: any = {
		select: () => builder,
		eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
		order: () => builder,
		range: (from: number, to: number) => { range = [from, to]; return builder; },
		maybeSingle: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
		then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
	};
	return builder;
}

vi.mock("@/runtime/env", () => ({
	getCache: () => ({
		get: async (key: string) => {
			if (mocks.failGet) throw new Error("kv unavailable");
			return mocks.store.get(key) ?? null;
		},
		put: async (key: string, value: string) => {
			if (mocks.failPut) throw new Error("kv write failed");
			mocks.store.set(key, value);
		},
		delete: async (key: string) => { mocks.store.delete(key); },
	}),
	getSupabaseAdmin: () => ({
		from: (table: string) => ({
			select: () => query(table),
			insert: async (payload: Record<string, unknown>) => {
				mocks.inserts.push({ table, payload });
				return { error: null };
			},
		}),
	}),
	getBindingsIfConfigured: () => mocks.bindings,
	dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(promise); },
	ensureRuntimeForBackground: () => () => {},
}));
vi.mock("@core/customer-rate-limit-tiers", () => ({ readCustomerLimits: vi.fn() }));

import { __resetTieredCacheForTests } from "./tiered-cache";
import { __resetCustomerQuotaStateForTests } from "./customer-rate-limits";
import {
	applicableRateLimits, buildRateLimitPlan, copyKeyRateLimitAssignment, guardRateLimitPolicies, publishRateLimitPlan,
	rateLimitPlanKey, rateLimitPolicyHeaders, readRateLimitPlan, rejectedByRateLimitPolicy, withRateLimitPolicyHeaders,
	type RateLimitPlan,
} from "./rate-limit-policies";
import type { PipelineContext } from "@pipeline/before/types";

const WS = "workspace-1";
const STRICT = "policy-strict";
const LOOSE = "policy-loose";
const TOKENS = "policy-tokens";

function policy(id: string, name: string, rpm: number | null, workspace = WS) {
	return { id, workspace_id: workspace, name, requests_per_minute: rpm };
}
function assignment(policyId: string, target: string, columns: Record<string, string> = {}, workspace = WS) {
	return { id: `${target}-${Object.values(columns).join("-")}`, workspace_id: workspace, policy_id: policyId, target_type: target,
		key_id: null, user_id: null, department_id: null, guardrail_id: null, ...columns };
}

const plan: RateLimitPlan = {
	v: 1,
	policies: { [STRICT]: { rpm: 2, name: "Strict" }, [LOOSE]: { rpm: 100, name: "Loose" }, [TOKENS]: { rpm: null, name: "Tokens" } },
	keys: { "key-1": LOOSE, "key-tokens": TOKENS },
	members: { "user-1": LOOSE },
	guardrails: { "guard-1": STRICT },
	endUserDefault: LOOSE,
};

let sequence = 0;
function ctx(overrides: Partial<PipelineContext> & { authMethod?: "api_key" | "oauth"; endUser?: string | null } = {}): PipelineContext {
	const { authMethod = "api_key", endUser = null, ...rest } = overrides;
	return {
		workspaceId: WS, keyId: "key-1", quotaUserId: "user-2", activeGuardrailIds: [],
		billingRequestId: `billing-${++sequence}`, requestId: `request-${sequence}`, internal: false,
		meta: { authMethod, requestUserId: endUser },
		...rest,
	} as unknown as PipelineContext;
}

async function settle() {
	while (mocks.background.length) await Promise.all(mocks.background.splice(0));
}

function publishPlan(value: RateLimitPlan) {
	mocks.store.set(rateLimitPlanKey(WS), JSON.stringify({ v: value, at: Date.now() }));
}

beforeEach(() => {
	__resetTieredCacheForTests();
	__resetCustomerQuotaStateForTests();
	mocks.store.clear();
	mocks.failGet = mocks.failPut = false;
	mocks.selectError = null;
	mocks.inserts.length = 0;
	mocks.background.length = 0;
	mocks.tables = { workspace_rate_limit_policies: [], workspace_rate_limit_policy_assignments: [] };
	mocks.admit.mockReset().mockImplementation(async (_scope: string, _kind: string, _id: string, limits: { requestsPerMinute: number }) =>
		({ allowed: true, limit: limits.requestsPerMinute, remaining: limits.requestsPerMinute - 1, retryAfterSeconds: 0 }));
	mocks.getByName.mockReset().mockReturnValue({ admit: mocks.admit });
	mocks.bindings = { RATE_LIMIT_POLICIES_ENABLED: "true", CUSTOMER_RATE_LIMITS: { getByName: mocks.getByName } };
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("rate limit plan publication", () => {
	it("builds a compact plan from the workspace's policies and assignments, omitting departments", async () => {
		mocks.tables.workspace_rate_limit_policies = [policy(STRICT, "Strict", 2), policy(TOKENS, "Tokens", null), policy("other", "Other", 9, "elsewhere")];
		mocks.tables.workspace_rate_limit_policy_assignments = [
			assignment(STRICT, "key", { key_id: "key-1" }),
			assignment(STRICT, "member", { user_id: "user-1" }),
			assignment(TOKENS, "guardrail", { guardrail_id: "guard-1" }),
			assignment(STRICT, "end_user_default"),
			assignment(STRICT, "department", { department_id: "dept-1" }),
			assignment("other", "key", { key_id: "key-9" }, "elsewhere"),
		];
		expect(await buildRateLimitPlan(WS)).toEqual({
			v: 1,
			policies: { [STRICT]: { rpm: 2, name: "Strict" }, [TOKENS]: { rpm: null, name: "Tokens" } },
			keys: { "key-1": STRICT },
			members: { "user-1": STRICT },
			guardrails: { "guard-1": TOKENS },
			endUserDefault: STRICT,
		});
	});

	it("writes the plan to KV, and deletes the key once the workspace has no assignments", async () => {
		mocks.tables.workspace_rate_limit_policies = [policy(STRICT, "Strict", 2)];
		mocks.tables.workspace_rate_limit_policy_assignments = [assignment(STRICT, "key", { key_id: "key-1" })];
		expect(await publishRateLimitPlan(WS)).toBe(true);
		expect(JSON.parse(mocks.store.get(rateLimitPlanKey(WS))!).v.keys).toEqual({ "key-1": STRICT });
		expect((await readRateLimitPlan(WS))?.keys).toEqual({ "key-1": STRICT });

		mocks.tables.workspace_rate_limit_policy_assignments = [];
		expect(await publishRateLimitPlan(WS)).toBe(true);
		expect(mocks.store.has(rateLimitPlanKey(WS))).toBe(false);
		// Publishing also drops this isolate's copy.
		expect(await readRateLimitPlan(WS)).toBeNull();
	});

	it("logs and reports failure instead of throwing when publishing fails", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		mocks.selectError = { message: "database unavailable" };
		expect(await publishRateLimitPlan(WS)).toBe(false);
		mocks.selectError = null;
		mocks.failPut = true;
		mocks.tables.workspace_rate_limit_policies = [policy(STRICT, "Strict", 2)];
		mocks.tables.workspace_rate_limit_policy_assignments = [assignment(STRICT, "end_user_default")];
		expect(await publishRateLimitPlan(WS)).toBe(false);
		expect(error).toHaveBeenCalledWith("rate_limit_plan_publish_failed", expect.objectContaining({ workspaceId: WS }));
	});

	it("treats a missing, malformed or unreadable plan as no policies", async () => {
		expect(await readRateLimitPlan(WS)).toBeNull();
		__resetTieredCacheForTests();
		mocks.store.set(rateLimitPlanKey(WS), JSON.stringify({ v: { v: 1, policies: {} }, at: Date.now() }));
		expect(await readRateLimitPlan(WS)).toBeNull();
		__resetTieredCacheForTests();
		mocks.failGet = true;
		expect(await readRateLimitPlan(WS)).toBeNull();
	});

	it("copies a rotated key's assignment to its replacement", async () => {
		mocks.tables.workspace_rate_limit_policy_assignments = [assignment(STRICT, "key", { key_id: "old" })];
		expect(await copyKeyRateLimitAssignment({ workspaceId: WS, fromKeyId: "old", toKeyId: "new", createdBy: "admin" })).toBe(true);
		expect(mocks.inserts).toEqual([{ table: "workspace_rate_limit_policy_assignments", payload: {
			workspace_id: WS, policy_id: STRICT, target_type: "key", key_id: "new", created_by: "admin",
		} }]);
		expect(await copyKeyRateLimitAssignment({ workspaceId: WS, fromKeyId: "unassigned", toKeyId: "new", createdBy: null })).toBe(false);
		expect(mocks.inserts).toHaveLength(1);
	});
});

describe("applicable rate limits", () => {
	it("resolves key, member and end-user default policies", () => {
		expect(applicableRateLimits(plan, { keyId: "key-1", userId: "user-1", endUserId: "customer-42" })).toEqual([
			{ policyId: LOOSE, name: "Loose", targetType: "key", rpm: 100, scopeKey: "key:key-1" },
			{ policyId: LOOSE, name: "Loose", targetType: "member", rpm: 100, scopeKey: "member:user-1" },
			{ policyId: LOOSE, name: "Loose", targetType: "end_user", rpm: 100, scopeKey: "end-user:customer-42" },
		]);
	});

	it("skips the end-user default without an end-user id, and policies without a request limit", () => {
		expect(applicableRateLimits(plan, { keyId: "key-tokens", userId: "user-2", endUserId: null })).toEqual([]);
		expect(applicableRateLimits(null, { keyId: "key-1" })).toEqual([]);
	});

	it("gives each key or OAuth user its own guardrail allowance", () => {
		const forKey = applicableRateLimits(plan, { keyId: "key-2", userId: "user-2", guardrailIds: ["guard-1", "guard-1", "unlimited"] });
		expect(forKey).toEqual([{ policyId: STRICT, name: "Strict", targetType: "guardrail", rpm: 2, scopeKey: "guardrail:guard-1:key:key-2" }]);
		expect(applicableRateLimits(plan, { keyId: "key-3", guardrailIds: ["guard-1"] })[0].scopeKey).toBe("guardrail:guard-1:key:key-3");
		// OAuth requests carry the client ID in keyId; it never matches a key assignment.
		const oauth = applicableRateLimits({ ...plan, keys: { client: STRICT } }, {
			keyId: "client", userId: "user-1", authMethodIsOAuth: true, guardrailIds: ["guard-1"],
		});
		expect(oauth.map((limit) => limit.scopeKey)).toEqual(["member:user-1", "guardrail:guard-1:user:user-1"]);
	});
});

describe("rate limit policy enforcement", () => {
	it("counts every applicable scope in the background with the policy's limit", async () => {
		publishPlan(plan);
		const request = ctx({ activeGuardrailIds: ["guard-1"], endUser: "customer-42" });
		expect(await guardRateLimitPolicies(request)).toBeNull();
		await settle();
		const scopes = mocks.admit.mock.calls.map(([scope, kind, id, limits]) => [scope, kind, id, limits]);
		expect(scopes).toEqual([
			[`rate-limit-policy:v1:${WS}:${LOOSE}:key:key-1`, "minute", request.billingRequestId, { requestsPerMinute: 100 }],
			[`rate-limit-policy:v1:${WS}:${STRICT}:guardrail:guard-1:key:key-1`, "minute", request.billingRequestId, { requestsPerMinute: 2 }],
			[`rate-limit-policy:v1:${WS}:${LOOSE}:end-user:customer-42`, "minute", request.billingRequestId, { requestsPerMinute: 100 }],
		]);
		expect(mocks.getByName).toHaveBeenCalledWith(`rate-limit-policy:v1:${WS}:${LOOSE}:key:key-1`);
	});

	it("reads the plan once per request and counts fallback attempts once", async () => {
		publishPlan(plan);
		const request = ctx();
		expect(await guardRateLimitPolicies(request)).toBeNull();
		// A plan change mid-request does not change what this request is counted against.
		publishPlan({ ...plan, keys: { "key-1": STRICT } });
		__resetTieredCacheForTests();
		for (let attempt = 0; attempt < 2; attempt++) expect(await guardRateLimitPolicies(request)).toBeNull();
		await settle();
		expect(mocks.admit).toHaveBeenCalledTimes(1);
		// A model fallback's context shares the primary request's admission.
		publishPlan(plan);
		__resetTieredCacheForTests();
		const fallback = ctx({ rateLimitAdmissionId: request.billingRequestId });
		expect(await guardRateLimitPolicies(fallback)).toBeNull();
		await settle();
		expect(mocks.admit).toHaveBeenCalledTimes(1);
	});

	it("replays a reported denial locally with the 429 contract and headers", async () => {
		publishPlan(plan);
		mocks.admit.mockImplementation(async (scope: string) => scope.includes("guardrail")
			? { allowed: true, limit: 2, remaining: 0, retryAfterSeconds: 42 }
			: { allowed: true, limit: 100, remaining: 50, retryAfterSeconds: 0 });
		const first = ctx({ activeGuardrailIds: ["guard-1"] });
		expect(await guardRateLimitPolicies(first)).toBeNull();
		await settle();
		const calls = mocks.admit.mock.calls.length;

		const second = ctx({ activeGuardrailIds: ["guard-1"] });
		const response = await guardRateLimitPolicies(second);
		expect(response?.status).toBe(429);
		expect(response?.headers.get("Retry-After")).toBe("42");
		expect(response?.headers.get("x-ratelimit-limit-requests")).toBe("2");
		expect(response?.headers.get("x-ratelimit-remaining-requests")).toBe("0");
		expect(response?.headers.get("x-ratelimit-reset-requests")).toBe("42s");
		expect(await response?.json()).toMatchObject({
			error: "rate_limit_exceeded",
			error_origin: "user",
			reason: "policy_requests_per_minute",
			policy_id: STRICT,
			limit_scope: "guardrail",
			request_id: second.requestId,
			description: "This API key, through a guardrail, reached the \"Strict\" rate limit policy's 2 requests per minute. Retry after 42 seconds.",
		});
		// A rejected request uses no other scope's allowance.
		await settle();
		expect(mocks.admit).toHaveBeenCalledTimes(calls);
		expect(rejectedByRateLimitPolicy(second)).toBe(true);
		// Another key covered by the same guardrail has its own allowance.
		expect(await guardRateLimitPolicies(ctx({ keyId: "key-2", activeGuardrailIds: ["guard-1"] }))).toBeNull();
		// The first request's later attempts are already admitted.
		expect(await guardRateLimitPolicies(first)).toBeNull();
	});

	it("reports approximate headers for the most restrictive applicable policy", async () => {
		publishPlan(plan);
		const request = ctx({ activeGuardrailIds: ["guard-1"] });
		await guardRateLimitPolicies(request);
		// Before any counter report: limit - 1 of the tightest policy.
		expect(rateLimitPolicyHeaders(request)).toEqual({
			"x-ratelimit-limit-requests": "2", "x-ratelimit-remaining-requests": "1", "x-ratelimit-reset-requests": "60s",
		});
		await settle();
		expect(rateLimitPolicyHeaders(request)).toEqual({
			"x-ratelimit-limit-requests": "2", "x-ratelimit-remaining-requests": "1", "x-ratelimit-reset-requests": "60s",
		});
		const next = ctx({ activeGuardrailIds: ["guard-1"] });
		mocks.admit.mockImplementation(async () => new Promise(() => {}));
		await guardRateLimitPolicies(next);
		// The last report predates this request's own count.
		expect(rateLimitPolicyHeaders(next)?.["x-ratelimit-remaining-requests"]).toBe("0");

		const response = withRateLimitPolicyHeaders(new Response("ok"), next);
		expect(response.headers.get("x-ratelimit-limit-requests")).toBe("2");
	});

	it("emits no headers when no policy applies or enforcement did not run", async () => {
		publishPlan(plan);
		const unlimited = ctx({ keyId: "key-tokens" });
		expect(await guardRateLimitPolicies(unlimited)).toBeNull();
		expect(rateLimitPolicyHeaders(unlimited)).toBeNull();
		expect(rateLimitPolicyHeaders(ctx())).toBeNull();
		expect(withRateLimitPolicyHeaders(new Response("ok"), ctx()).headers.get("x-ratelimit-limit-requests")).toBeNull();
	});

	it("does nothing when the flag is off, the binding is missing, or the request is internal", async () => {
		publishPlan(plan);
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await guardRateLimitPolicies(ctx({ internal: true }))).toBeNull();
		mocks.bindings.RATE_LIMIT_POLICIES_ENABLED = "false";
		expect(await guardRateLimitPolicies(ctx())).toBeNull();
		mocks.bindings = { RATE_LIMIT_POLICIES_ENABLED: "true" };
		expect(await guardRateLimitPolicies(ctx())).toBeNull();
		expect(mocks.background).toHaveLength(0);
		expect(mocks.admit).not.toHaveBeenCalled();
	});

	it("fails open when the counter fails", async () => {
		publishPlan(plan);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		mocks.admit.mockRejectedValue(new Error("unavailable"));
		expect(await guardRateLimitPolicies(ctx())).toBeNull();
		await settle();
		expect(await guardRateLimitPolicies(ctx())).toBeNull();
	});
});
