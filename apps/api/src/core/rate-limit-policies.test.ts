import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	store: new Map<string, string>(),
	failGet: false,
	failPut: false,
	onPut: null as null | (() => void),
	tables: {} as Record<string, Array<Record<string, unknown>>>,
	selectError: null as { message: string } | null,
	inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
	bindings: {} as Record<string, unknown>,
	admit: vi.fn(),
	chargeTokens: vi.fn(),
	peekTokens: vi.fn(),
	acquireConcurrency: vi.fn(),
	releaseConcurrency: vi.fn(),
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
		in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
		not: (column: string, operator: string, value: unknown) => {
			if (operator !== "is" || value !== null) throw new Error(`unsupported not filter ${operator}`);
			filters.push((row) => row[column] != null);
			return builder;
		},
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
			const onPut = mocks.onPut;
			mocks.onPut = null;
			onPut?.();
		},
		delete: async (key: string) => { mocks.store.delete(key); },
		list: async ({ prefix }: { prefix: string }) => ({
			keys: [...mocks.store.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })),
			list_complete: true,
		}),
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
	captureBackgroundDispatcher: () => (promise: Promise<unknown>) => { mocks.background.push(promise); },
	ensureRuntimeForBackground: () => () => {},
}));
vi.mock("@core/customer-rate-limit-tiers", () => ({ readCustomerLimits: vi.fn() }));

import { __resetTieredCacheForTests } from "./tiered-cache";
import { __resetCustomerQuotaStateForTests, CONCURRENCY_LEASE_TTL_MS, createConcurrencyLeases, releaseConcurrencyAfter } from "./customer-rate-limits";
import {
	applicableRateLimits, buildRateLimitPlan, chargeRateLimitPolicyTokens, copyKeyRateLimitAssignment, guardRateLimitPolicies, publishRateLimitPlan, reconcileRateLimitPlans,
	rateLimitPlanKey, rateLimitPolicyHeaders, readRateLimitPlan, rejectedByRateLimitPolicy, withRateLimitPolicyHeaders,
	type RateLimitPlan,
} from "./rate-limit-policies";
import type { PipelineContext } from "@pipeline/before/types";

const WS = "workspace-1";
const STRICT = "policy-strict";
const LOOSE = "policy-loose";
const TOKENS = "policy-tokens";

function policy(id: string, name: string, rpm: number | null, workspace = WS, tpm: number | string | null = null) {
	return { id, workspace_id: workspace, name, requests_per_minute: rpm, tokens_per_minute: tpm };
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
function ctx(overrides: Partial<PipelineContext> & { authMethod?: "api_key" | "oauth"; apiKeyRef?: string; endUser?: string | null } = {}): PipelineContext {
	const { authMethod = "api_key", apiKeyRef = "kid_key", endUser = null, ...rest } = overrides;
	return {
		workspaceId: WS, keyId: "key-1", quotaUserId: "user-2", activeGuardrailIds: [],
		billingRequestId: `billing-${++sequence}`, requestId: `request-${sequence}`, internal: false,
		meta: { authMethod, apiKeyRef, requestUserId: endUser },
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
	mocks.chargeTokens.mockReset().mockImplementation(async (_scope: string, tokens: number, limit: number) =>
		({ allowed: tokens < limit, limit, remaining: Math.max(0, limit - tokens), retryAfterSeconds: tokens < limit ? 0 : 30 }));
	mocks.peekTokens.mockReset().mockImplementation(async (_scope: string, limit: number) => ({ allowed: true, limit, remaining: limit, retryAfterSeconds: 0 }));
		mocks.acquireConcurrency.mockReset().mockImplementation(async (_scope: string, _lease: string, limit: number) => ({ allowed: true, limit, remaining: limit - 1, retryAfterSeconds: 0 }));
	mocks.releaseConcurrency.mockReset().mockResolvedValue(undefined);
	mocks.getByName.mockReset().mockReturnValue({
		admit: mocks.admit, chargeTokens: mocks.chargeTokens, peekTokens: mocks.peekTokens,
		acquireConcurrency: mocks.acquireConcurrency, releaseConcurrency: mocks.releaseConcurrency,
	});
	mocks.bindings = { RATE_LIMIT_POLICIES_ENABLED: "true", CUSTOMER_RATE_LIMITS: { getByName: mocks.getByName } };
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("rate limit plan publication", () => {
	it("builds a compact plan from the workspace's policies and assignments", async () => {
		mocks.tables.workspace_rate_limit_policies = [policy(STRICT, "Strict", 2), policy(TOKENS, "Tokens", null, WS, "50000"), policy("other", "Other", 9, "elsewhere")];
		mocks.tables.workspace_rate_limit_policy_assignments = [
			assignment(STRICT, "key", { key_id: "key-1" }),
			assignment(STRICT, "member", { user_id: "user-1" }),
			assignment(TOKENS, "guardrail", { guardrail_id: "guard-1" }),
			assignment(STRICT, "end_user_default"),
			assignment("other", "key", { key_id: "key-9" }, "elsewhere"),
		];
		expect(await buildRateLimitPlan(WS)).toEqual({
			v: 1,
			policies: { [STRICT]: { rpm: 2, tpm: null, name: "Strict" }, [TOKENS]: { rpm: null, tpm: 50000, name: "Tokens" } },
			keys: { "key-1": STRICT },
			members: { "user-1": STRICT },
			guardrails: { "guard-1": TOKENS },
			endUserDefault: STRICT,
		});
	});

	it("adds the department links a department policy needs", async () => {
		mocks.tables = {
			workspace_rate_limit_policies: [policy(STRICT, "Strict", 2), policy(LOOSE, "Loose", 100)],
			workspace_rate_limit_policy_assignments: [
				assignment(STRICT, "department", { department_id: "dept-sales" }),
				assignment(LOOSE, "department", { department_id: "dept-legal" }),
			],
			keys: [
				{ id: "key-linked", workspace_id: WS, department_id: "dept-sales" },
				// Linked to a department without a policy: still kept, so it does not fall back to its creator's.
				{ id: "key-unlimited-dept", workspace_id: WS, department_id: "dept-ops" },
				{ id: "key-unlinked", workspace_id: WS, department_id: null },
				{ id: "key-elsewhere", workspace_id: "elsewhere", department_id: "dept-x" },
			],
			workspace_department_grants: [
				{ workspace_id: WS, user_id: "user-both", department_id: "dept-sales" },
				{ workspace_id: WS, user_id: "user-both", department_id: "dept-legal" },
				{ workspace_id: WS, user_id: "user-both", department_id: "dept-ops" },
				{ workspace_id: WS, user_id: "user-ops", department_id: "dept-ops" },
				{ workspace_id: WS, user_id: "user-overridden", department_id: "dept-sales" },
				{ workspace_id: WS, user_id: "user-none", department_id: "dept-legal" },
			],
			workspace_member_overrides: [
				{ workspace_id: WS, user_id: "user-overridden", department_override_enabled: true, department_id: "dept-legal" },
				{ workspace_id: WS, user_id: "user-none", department_override_enabled: true, department_id: null },
				{ workspace_id: WS, user_id: "user-both", department_override_enabled: false, department_id: "dept-ops" },
			],
		};
		const built = await buildRateLimitPlan(WS);
		expect(built).toMatchObject({
			departments: { "dept-sales": STRICT, "dept-legal": LOOSE },
			keyDepartments: { "key-linked": "dept-sales", "key-unlimited-dept": "dept-ops" },
			// Every department with a policy; an enabled override replaces the directory's departments.
			memberDepartments: { "user-both": ["dept-legal", "dept-sales"], "user-overridden": ["dept-legal"] },
		});
		expect(Object.keys(built.policies).sort()).toEqual([LOOSE, STRICT]);
		// Without a department policy the plan carries no department links.
		mocks.tables.workspace_rate_limit_policy_assignments = [assignment(STRICT, "key", { key_id: "key-1" })];
		const withoutDepartments = await buildRateLimitPlan(WS);
		expect(withoutDepartments).not.toHaveProperty("departments");
		expect(withoutDepartments).not.toHaveProperty("keyDepartments");
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

	it("applies a plan published elsewhere to the first request after this isolate sat idle", async () => {
		vi.useFakeTimers({ now: 1_000_000 });
		expect(await readRateLimitPlan(WS)).toBeNull();
		// Another isolate publishes; this one keeps its cached "no plan" meanwhile.
		mocks.tables.workspace_rate_limit_policies = [policy(STRICT, "Strict", 2)];
		mocks.tables.workspace_rate_limit_policy_assignments = [assignment(STRICT, "key", { key_id: "key-1" })];
		const plan = await buildRateLimitPlan(WS);
		mocks.store.set(rateLimitPlanKey(WS), JSON.stringify({ v: plan, at: 1_005_000 }));

		vi.setSystemTime(1_000_000 + 121_000);
		expect((await readRateLimitPlan(WS))?.keys).toEqual({ "key-1": STRICT });
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
			{ policyId: LOOSE, name: "Loose", targetType: "key", rpm: 100, tpm: null, scopeKey: "key:key-1" },
			{ policyId: LOOSE, name: "Loose", targetType: "member", rpm: 100, tpm: null, scopeKey: "member:user-1" },
			{ policyId: LOOSE, name: "Loose", targetType: "end_user", rpm: 100, tpm: null, scopeKey: "end-user:customer-42" },
		]);
	});

	it("skips the end-user default without an end-user id, and policies without any enforced limit", () => {
		// TOKENS has no request limit and was published before plans carried tpm.
		expect(applicableRateLimits(plan, { keyId: "key-tokens", userId: "user-2", endUserId: null })).toEqual([]);
		expect(applicableRateLimits(null, { keyId: "key-1" })).toEqual([]);
	});

	it("shares one department allowance among everything that counts toward the department", () => {
		const departmentPlan: RateLimitPlan = {
			...plan,
			departments: { "dept-sales": STRICT, "dept-legal": LOOSE },
			keyDepartments: { "key-linked": "dept-sales", "key-ops": "dept-ops" },
			memberDepartments: { "user-both": ["dept-legal", "dept-sales"] },
		};
		const scopes = (subject: Parameters<typeof applicableRateLimits>[1]) =>
			applicableRateLimits(departmentPlan, subject).filter((limit) => limit.targetType === "department").map((limit) => limit.scopeKey);
		// A linked key counts toward its own department only, whoever created it.
		expect(scopes({ keyId: "key-linked", userId: "user-both" })).toEqual(["department:dept-sales"]);
		expect(scopes({ keyId: "key-ops", userId: "user-both" })).toEqual([]);
		// Other keys count toward every department of their creator; OAuth requests toward their user's.
		expect(scopes({ keyId: "key-2", userId: "user-both" })).toEqual(["department:dept-legal", "department:dept-sales"]);
		expect(scopes({ keyId: "key-linked", userId: "user-both", keyIdIsOAuthClient: true })).toEqual(["department:dept-legal", "department:dept-sales"]);
		expect(scopes({ keyId: "key-2", userId: "user-9" })).toEqual([]);
		expect(applicableRateLimits(departmentPlan, { keyId: "key-linked" })).toContainEqual(
			{ policyId: STRICT, name: "Strict", targetType: "department", rpm: 2, tpm: null, scopeKey: "department:dept-sales" },
		);
		// Plans published before department limits carry none of the department fields.
		expect(applicableRateLimits(plan, { keyId: "key-linked", userId: "user-both" }).some((limit) => limit.targetType === "department")).toBe(false);
	});

	it("gives each key or OAuth user its own guardrail allowance", () => {
		const forKey = applicableRateLimits(plan, { keyId: "key-2", userId: "user-2", guardrailIds: ["guard-1", "guard-1", "unlimited"] });
		expect(forKey).toEqual([{ policyId: STRICT, name: "Strict", targetType: "guardrail", rpm: 2, tpm: null, scopeKey: "guardrail:guard-1:key:key-2" }]);
		expect(applicableRateLimits(plan, { keyId: "key-3", guardrailIds: ["guard-1"] })[0].scopeKey).toBe("guardrail:guard-1:key:key-3");
		// OAuth requests carry the client ID in keyId; it never matches a key assignment.
		const oauth = applicableRateLimits({ ...plan, keys: { client: STRICT } }, {
			keyId: "client", userId: "user-1", keyIdIsOAuthClient: true, guardrailIds: ["guard-1"],
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

	it("counts a delegated OAuth key's requests against the key, but never an OAuth access token's client ID", async () => {
		publishPlan(plan);
		// Delegated OAuth keys record authMethod "oauth" for app attribution, yet are real keys.
		const delegated = ctx({ authMethod: "oauth", apiKeyRef: "kid_delegated" });
		expect(await guardRateLimitPolicies(delegated)).toBeNull();
		await settle();
		expect(mocks.admit.mock.calls.map(([scope]) => scope)).toContain(`rate-limit-policy:v1:${WS}:${LOOSE}:key:key-1`);

		mocks.admit.mockClear();
		const accessToken = ctx({ authMethod: "oauth", apiKeyRef: "oauth_key-1" });
		expect(await guardRateLimitPolicies(accessToken)).toBeNull();
		await settle();
		expect(mocks.admit.mock.calls.map(([scope]) => scope)).not.toContain(`rate-limit-policy:v1:${WS}:${LOOSE}:key:key-1`);
	});

	it("does not count a request classifier's own call against the caller's policies", async () => {
		publishPlan(plan);
		expect(await guardRateLimitPolicies(ctx({ classifierSubrequest: true }))).toBeNull();
		await settle();
		expect(mocks.admit).not.toHaveBeenCalled();
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
			code: "rate_limit_exceeded",
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

	it("counts a department as one allowance and rejects every request that counts toward it", async () => {
		publishPlan({
			v: 1, policies: { [STRICT]: { rpm: 2, tpm: null, name: "Sales cap" } }, keys: {}, members: {}, guardrails: {}, endUserDefault: null,
			departments: { "dept-sales": STRICT }, keyDepartments: { "key-linked": "dept-sales" }, memberDepartments: { "user-sales": ["dept-sales"] },
		});
		const department = `rate-limit-policy:v1:${WS}:${STRICT}:department:dept-sales`;
		mocks.admit.mockImplementation(async () => ({ allowed: true, limit: 2, remaining: 0, retryAfterSeconds: 20 }));
		expect(await guardRateLimitPolicies(ctx({ keyId: "key-linked", quotaUserId: "user-other" }))).toBeNull();
		await settle();
		expect(mocks.admit.mock.calls.map(([scope]) => scope)).toEqual([department]);

		// A different key, created by a department member, shares the exhausted allowance.
		const rejected = await guardRateLimitPolicies(ctx({ keyId: "key-2", quotaUserId: "user-sales" }));
		expect(rejected?.status).toBe(429);
		expect(await rejected?.json()).toMatchObject({
			reason: "policy_requests_per_minute",
			policy_id: STRICT,
			limit_scope: "department",
			description: "This request's department reached the \"Sales cap\" rate limit policy's 2 requests per minute. Retry after 20 seconds.",
		});
		// So do the member's OAuth requests; requests outside the department do not.
		expect((await guardRateLimitPolicies(ctx({ keyId: "client", quotaUserId: "user-sales", authMethod: "oauth", apiKeyRef: "oauth_client" })))?.status).toBe(429);
		expect(await guardRateLimitPolicies(ctx({ keyId: "key-3", quotaUserId: "user-other" }))).toBeNull();
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

describe("tokens per minute", () => {
	const TPM = "policy-tpm";
	const tokenPlan: RateLimitPlan = {
		...plan,
		policies: { ...plan.policies, [TPM]: { rpm: null, tpm: 1000, name: "Token budget" }, [LOOSE]: { rpm: 100, tpm: 5000, name: "Loose" } },
		keys: { "key-1": TPM },
	};
	const scope = (target: string) => `rate-limit-policy:v1:${WS}:${target}`;

	it("applies a token-only policy and asks its counter what is left without counting a request", async () => {
		publishPlan(tokenPlan);
		expect(applicableRateLimits(tokenPlan, { keyId: "key-1" })).toEqual([
			{ policyId: TPM, name: "Token budget", targetType: "key", rpm: null, tpm: 1000, scopeKey: "key:key-1" },
		]);
		const request = ctx({ quotaUserId: "user-1" });
		expect(await guardRateLimitPolicies(request)).toBeNull();
		await settle();
		expect(mocks.peekTokens.mock.calls).toEqual([
			[scope(`${TPM}:key:key-1`), 1000],
			[scope(`${LOOSE}:member:user-1`), 5000],
		]);
		// Only the member policy has a request limit.
		expect(mocks.admit.mock.calls.map(([key]) => key)).toEqual([scope(`${LOOSE}:member:user-1`)]);
		expect(rateLimitPolicyHeaders(request)).toEqual({
			"x-ratelimit-limit-requests": "100", "x-ratelimit-remaining-requests": "99", "x-ratelimit-reset-requests": "60s",
			"x-ratelimit-limit-tokens": "1000", "x-ratelimit-remaining-tokens": "1000", "x-ratelimit-reset-tokens": "60s",
		});
	});

	it("charges completed usage once to each token allowance, then rejects locally while exhausted", async () => {
		publishPlan(tokenPlan);
		const first = ctx({ quotaUserId: "user-1" });
		await guardRateLimitPolicies(first);
		await settle();
		const usage = { input_tokens: 700, output_tokens: 500 };
		chargeRateLimitPolicyTokens(first, usage);
		chargeRateLimitPolicyTokens(first, usage);
		await settle();
		expect(mocks.chargeTokens.mock.calls).toEqual([
			[scope(`${TPM}:key:key-1`), 1200, 1000],
			[scope(`${LOOSE}:member:user-1`), 1200, 5000],
		]);
		expect(rateLimitPolicyHeaders(first)).toMatchObject({ "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "30s" });

		const second = ctx({ quotaUserId: "user-1" });
		const response = await guardRateLimitPolicies(second);
		expect(response?.status).toBe(429);
		expect(response?.headers.get("Retry-After")).toBe("30");
		expect(response?.headers.get("x-ratelimit-limit-tokens")).toBe("1000");
		expect(response?.headers.get("x-ratelimit-remaining-tokens")).toBe("0");
		expect(response?.headers.get("x-ratelimit-limit-requests")).toBeNull();
		expect(await response?.json()).toMatchObject({
			code: "rate_limit_exceeded",
			error: { code: "rate_limit_exceeded", type: "rate_limit_error", metadata: { reason: "policy_tokens_per_minute", policy_id: TPM, limit_scope: "key" } },
			reason: "policy_tokens_per_minute",
			policy_id: TPM,
			limit_scope: "key",
			description: "This API key reached the \"Token budget\" rate limit policy's 1000 tokens per minute. Retry after 30 seconds.",
		});
		// A rejected request is never charged.
		chargeRateLimitPolicyTokens(second, usage);
		await settle();
		expect(mocks.chargeTokens).toHaveBeenCalledTimes(2);
	});

	it("charges each attempt once, using the largest usage a failed attempt reports", async () => {
		publishPlan(tokenPlan);
		const request = ctx({ quotaUserId: "nobody" });
		await guardRateLimitPolicies(request);
		// A failed attempt before a provider fallback, reported by two candidates.
		chargeRateLimitPolicyTokens(request, [{ input_tokens: 40, output_tokens: 0 }, null, { usage: "unparsed" }, { input_tokens: 90, output_tokens: 10 }], "attempt:1:openai");
		chargeRateLimitPolicyTokens(request, [{ input_tokens: 90, output_tokens: 10 }], "attempt:1:openai");
		// The fallback that succeeded, reported by two settlement paths.
		chargeRateLimitPolicyTokens(request, { input_tokens: 200, output_tokens: 50 });
		chargeRateLimitPolicyTokens(request, { input_tokens: 200, output_tokens: 50 });
		await settle();
		expect(mocks.chargeTokens.mock.calls.map(([, tokens]) => tokens)).toEqual([100, 250]);
	});

	it("learns of exhaustion caused on other isolates when admitting", async () => {
		publishPlan(tokenPlan);
		mocks.peekTokens.mockImplementation(async (_scope: string, limit: number) => ({ allowed: false, limit, remaining: 0, retryAfterSeconds: 12 }));
		expect(await guardRateLimitPolicies(ctx({ quotaUserId: "nobody" }))).toBeNull();
		await settle();
		const response = await guardRateLimitPolicies(ctx({ quotaUserId: "nobody" }));
		expect(response?.headers.get("Retry-After")).toBe("12");
	});

	it("charges nothing without token limits, usage, enforcement, or when the counter fails", async () => {
		publishPlan(plan);
		const requestOnly = ctx();
		await guardRateLimitPolicies(requestOnly);
		chargeRateLimitPolicyTokens(requestOnly, { input_tokens: 10, output_tokens: 10 });
		chargeRateLimitPolicyTokens(ctx(), { input_tokens: 10, output_tokens: 10 });
		publishPlan(tokenPlan);
		__resetTieredCacheForTests();
		const noUsage = ctx();
		await guardRateLimitPolicies(noUsage);
		chargeRateLimitPolicyTokens(noUsage, null);
		chargeRateLimitPolicyTokens(noUsage, { input_tokens: 0, output_tokens: 0 });
		await settle();
		expect(mocks.chargeTokens).not.toHaveBeenCalled();

		vi.spyOn(console, "warn").mockImplementation(() => {});
		mocks.chargeTokens.mockRejectedValue(new Error("unavailable"));
		chargeRateLimitPolicyTokens(noUsage, { input_tokens: 5, output_tokens: 5 });
		await settle();
		expect(await guardRateLimitPolicies(ctx())).toBeNull();
	});
});

describe("plan publication under concurrent changes", () => {
	beforeEach(() => {
		mocks.store.clear();
		mocks.failGet = false;
		mocks.failPut = false;
		mocks.onPut = null;
		mocks.selectError = null;
		__resetTieredCacheForTests();
	});

	it("stores the newest plan when the database changes while publishing", async () => {
		mocks.tables = {
			workspace_rate_limit_policies: [policy(STRICT, "Strict", 2)],
			workspace_rate_limit_policy_assignments: [assignment(STRICT, "key", { key_id: "key-1" })],
		};
		// Another request adds an assignment after this publish read the database.
		mocks.onPut = () => {
			mocks.tables.workspace_rate_limit_policy_assignments.push(assignment(STRICT, "member", { user_id: "user-1" }));
		};
		expect(await publishRateLimitPlan(WS)).toBe(true);
		const stored = JSON.parse(mocks.store.get(rateLimitPlanKey(WS))!).v as RateLimitPlan;
		expect(stored.keys).toEqual({ "key-1": STRICT });
		expect(stored.members).toEqual({ "user-1": STRICT });
	});

	it("reconciles every workspace with assignments or a stored plan", async () => {
		mocks.tables = {
			workspace_rate_limit_policies: [policy(STRICT, "Strict", 2), policy(LOOSE, "Loose", 100, "workspace-2")],
			workspace_rate_limit_policy_assignments: [
				assignment(STRICT, "key", { key_id: "key-1" }),
				assignment(LOOSE, "end_user_default", {}, "workspace-2"),
			],
		};
		// A plan whose assignments were removed while a publish failed.
		mocks.store.set(rateLimitPlanKey("workspace-3"), JSON.stringify({ v: plan, at: 0 }));

		const summary = await reconcileRateLimitPlans();

		expect(summary).toEqual({ workspaces: 3, published: 3, failed: 0, truncated: false });
		expect(JSON.parse(mocks.store.get(rateLimitPlanKey(WS))!).v.keys).toEqual({ "key-1": STRICT });
		expect(JSON.parse(mocks.store.get(rateLimitPlanKey("workspace-2"))!).v.endUserDefault).toBe(LOOSE);
		expect(mocks.store.has(rateLimitPlanKey("workspace-3"))).toBe(false);
	});
});

describe("concurrency limits and strict policies", () => {
	const CONCURRENT = "policy-concurrent";
	const STRICT_RPM = "policy-fail-closed";
	const concurrencyPlan = (policy: RateLimitPlan["policies"][string], keyId = "key-1"): RateLimitPlan => ({
		v: 1, policies: { [CONCURRENT]: policy }, keys: { [keyId]: CONCURRENT }, members: {}, guardrails: {}, endUserDefault: null,
	});
	const scopeKey = `rate-limit-policy:v1:${WS}:${CONCURRENT}:key:key-1`;

	it("publishes the concurrency limit and strict flag only when a policy sets them", async () => {
		mocks.tables.workspace_rate_limit_policies = [
			{ ...policy(CONCURRENT, "Concurrent", null), concurrent_requests: 3, fail_closed: true },
			{ ...policy(LOOSE, "Loose", 100), concurrent_requests: null, fail_closed: false },
		];
		mocks.tables.workspace_rate_limit_policy_assignments = [assignment(CONCURRENT, "key", { key_id: "key-1" }), assignment(LOOSE, "member", { user_id: "user-1" })];
		expect((await buildRateLimitPlan(WS)).policies).toEqual({
			[CONCURRENT]: { rpm: null, tpm: null, cc: 3, strict: true, name: "Concurrent" },
			[LOOSE]: { rpm: 100, tpm: null, name: "Loose" },
		});
		expect(applicableRateLimits(concurrencyPlan({ rpm: null, cc: 3, strict: true, name: "Concurrent" }), { keyId: "key-1" })).toEqual([
			{ policyId: CONCURRENT, name: "Concurrent", targetType: "key", rpm: null, tpm: null, cc: 3, strict: true, scopeKey: "key:key-1" },
		]);
	});

	it("takes a concurrency slot before admitting, and shares it across the request's attempts", async () => {
		publishPlan(concurrencyPlan({ rpm: null, cc: 2, name: "Concurrent" }));
		const leases = createConcurrencyLeases();
		const request = ctx({ rateLimitConcurrency: leases });
		expect(await guardRateLimitPolicies(request)).toBeNull();
		expect(mocks.acquireConcurrency).toHaveBeenCalledWith(scopeKey, request.billingRequestId, 2, CONCURRENCY_LEASE_TTL_MS);
		expect([...leases.held]).toEqual([[scopeKey, request.billingRequestId]]);
		// A provider fallback attempt is already admitted.
		expect(await guardRateLimitPolicies(request)).toBeNull();
		expect(mocks.acquireConcurrency).toHaveBeenCalledTimes(1);
	});

	it("rejects with 429 when every slot is in use, and holds nothing", async () => {
		publishPlan(concurrencyPlan({ rpm: 50, cc: 2, name: "Concurrent" }));
		mocks.acquireConcurrency.mockResolvedValue({ allowed: false, limit: 2, remaining: 0, retryAfterSeconds: 1 });
		const leases = createConcurrencyLeases();
		const request = ctx({ rateLimitConcurrency: leases });
		const response = await guardRateLimitPolicies(request);
		expect(response?.status).toBe(429);
		expect(response?.headers.get("Retry-After")).toBe("1");
		// No per-minute allowance refused this request, so there are no request headers to report.
		expect(response?.headers.get("x-ratelimit-limit-requests")).toBeNull();
		expect(await response?.json()).toMatchObject({
			error: expect.objectContaining({ code: "rate_limit_exceeded" }), reason: "policy_concurrent_requests", policy_id: CONCURRENT, limit_scope: "key",
			description: expect.stringContaining("already has 2 requests in progress"),
		});
		expect(rejectedByRateLimitPolicy(request)).toBe(true);
		await settle();
		// Nothing was counted against the request allowance, and no slot is held.
		expect(mocks.admit).not.toHaveBeenCalled();
		expect(leases.held.size).toBe(0);
	});

	it("words a limit of one request and a one-second retry in the singular", async () => {
		publishPlan(concurrencyPlan({ rpm: null, cc: 1, name: "Concurrent" }));
		mocks.acquireConcurrency.mockResolvedValue({ allowed: false, limit: 1, remaining: 0, retryAfterSeconds: 1 });
		const response = await guardRateLimitPolicies(ctx({ rateLimitConcurrency: createConcurrencyLeases() }));
		expect(((await response?.json()) as { description: string }).description).toBe(
			"This API key already has 1 request in progress, the \"Concurrent\" rate limit policy's limit on concurrent requests. Retry after 1 second.",
		);
	});

	it("does not limit concurrency for requests that nothing would release", async () => {
		publishPlan(concurrencyPlan({ rpm: null, cc: 1, name: "Concurrent" }));
		expect(await guardRateLimitPolicies(ctx())).toBeNull();
		expect(mocks.acquireConcurrency).not.toHaveBeenCalled();
	});

	it("admits when the counter does not answer, unless the policy is strict", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		mocks.acquireConcurrency.mockRejectedValue(new Error("object unavailable"));
		publishPlan(concurrencyPlan({ rpm: null, cc: 2, name: "Concurrent" }));
		const leases = createConcurrencyLeases();
		expect(await guardRateLimitPolicies(ctx({ rateLimitConcurrency: leases }))).toBeNull();
		// The slot may have been taken after all, so it is still released with the request.
		expect(leases.held.size).toBe(1);

		__resetTieredCacheForTests();
		publishPlan(concurrencyPlan({ rpm: null, cc: 2, strict: true, name: "Concurrent" }));
		const strictLeases = createConcurrencyLeases();
		const response = await guardRateLimitPolicies(ctx({ rateLimitConcurrency: strictLeases }));
		expect(response?.status).toBe(429);
		expect(await response?.json()).toMatchObject({ reason: "policy_unavailable", description: expect.stringContaining("is strict") });
		await settle();
		expect(mocks.releaseConcurrency).toHaveBeenCalledWith(scopeKey, expect.any(String));
	});

	it("awaits a strict policy's request count instead of counting in the background", async () => {
		publishPlan({ v: 1, policies: { [STRICT_RPM]: { rpm: 1, strict: true, name: "Fail closed" } }, keys: { "key-1": STRICT_RPM }, members: {}, guardrails: {}, endUserDefault: null });
		mocks.admit.mockResolvedValueOnce({ allowed: true, limit: 1, remaining: 0, retryAfterSeconds: 40 })
			.mockResolvedValueOnce({ allowed: false, limit: 1, remaining: 0, retryAfterSeconds: 40 });
		const first = ctx();
		expect(await guardRateLimitPolicies(first)).toBeNull();
		expect(mocks.admit).toHaveBeenCalledTimes(1);
		await settle();
		// Not counted a second time in the background.
		expect(mocks.admit).toHaveBeenCalledTimes(1);
		// The exhausted allowance is now replayed locally on this isolate.
		const second = await guardRateLimitPolicies(ctx());
		expect(second?.status).toBe(429);
		expect(await second?.json()).toMatchObject({ reason: "policy_requests_per_minute" });
		expect(mocks.admit).toHaveBeenCalledTimes(1);
	});

	it("rejects a strict policy's request when its counter fails", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		publishPlan({ v: 1, policies: { [STRICT_RPM]: { rpm: 10, tpm: 1000, strict: true, name: "Fail closed" } }, keys: { "key-1": STRICT_RPM }, members: {}, guardrails: {}, endUserDefault: null });
		mocks.peekTokens.mockRejectedValue(new Error("object unavailable"));
		const response = await guardRateLimitPolicies(ctx());
		expect(response?.status).toBe(429);
		expect(await response?.json()).toMatchObject({ reason: "policy_unavailable", policy_id: STRICT_RPM });
	});

	it("still releases a slot when the body finishes after the request's runtime was cleared", async () => {
		publishPlan(concurrencyPlan({ rpm: null, cc: 2, name: "Concurrent" }));
		const leases = createConcurrencyLeases();
		const request = ctx({ rateLimitConcurrency: leases });
		expect(await guardRateLimitPolicies(request)).toBeNull();
		const response = releaseConcurrencyAfter(new Response("done"), leases);
		// withRuntime clears the runtime before a non-streamed body is read.
		mocks.bindings = {};
		await response.text();
		await settle();
		expect(mocks.releaseConcurrency).toHaveBeenCalledWith(scopeKey, request.billingRequestId);
	});

	it("releases the request's slots once the response body is delivered or cancelled", async () => {
		const leases = () => {
			const held = createConcurrencyLeases();
			held.held.set(scopeKey, "request-1");
			return held;
		};
		const streamed = leases();
		const response = releaseConcurrencyAfter(new Response("hello", { status: 200, headers: { "x-test": "kept" } }), streamed);
		expect(response.headers.get("x-test")).toBe("kept");
		expect(streamed.released).toBe(false);
		expect(await response.text()).toBe("hello");
		expect(streamed.released).toBe(true);
		await settle();
		expect(mocks.releaseConcurrency).toHaveBeenCalledWith(scopeKey, "request-1");

		const cancelled = leases();
		await releaseConcurrencyAfter(new Response(new ReadableStream({ pull() {} })), cancelled).body!.cancel();
		expect(cancelled.released).toBe(true);

		const empty = leases();
		releaseConcurrencyAfter(new Response(null, { status: 204 }), empty);
		expect(empty.released).toBe(true);

		// A request holding no slot keeps its original response.
		const original = new Response("x");
		expect(releaseConcurrencyAfter(original, createConcurrencyLeases())).toBe(original);
	});
});
