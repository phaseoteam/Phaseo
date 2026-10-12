// Purpose: Enforce workspace rate limit policies (requests per minute) on the request path.
// Why: Admins assign named limits to keys, members, guardrails and end users;
//      the request path must apply them without Postgres or added latency.
// How: The control API publishes a compact per-workspace plan to KV after
//      every change (`rate-limit-plan:v1:{workspace}`; no key means no
//      policies). Requests read it through the tiered cache (isolate memory for
//      about a minute, then KV), resolve the policies that apply, and admit
//      them through the customer limiter (core/customer-rate-limits.ts): each
//      applicable scope is counted exactly by its own CustomerRateLimit Durable
//      Object, and a scope the isolate knows is exhausted is rejected locally.
//      Changes therefore take effect within about a minute. Department
//      assignments, tokens_per_minute and concurrent_requests are not enforced
//      yet, and fail_closed is ignored: every failure admits the request.
import { getCache, getSupabaseAdmin } from "@/runtime/env";
import { invalidateTieredL1, tieredRead } from "@core/tiered-cache";
import {
	admitPolicyQuotas, policyQuotaBindings, policyQuotaReport,
	type PolicyQuotaDenial,
} from "@core/customer-rate-limits";
import { err } from "@pipeline/before/http";
import type { PipelineContext } from "@pipeline/before/types";

export type RateLimitPlan = {
	v: 1;
	policies: Record<string, { rpm: number | null; name: string }>;
	keys: Record<string, string>;
	members: Record<string, string>;
	guardrails: Record<string, string>;
	endUserDefault: string | null;
};

export type RateLimitTarget = "key" | "member" | "guardrail" | "end_user";

export type ApplicableRateLimit = {
	policyId: string;
	name: string;
	targetType: RateLimitTarget;
	rpm: number;
	/** Subject within the policy, e.g. `key:{keyId}`. */
	scopeKey: string;
};

const PAGE_SIZE = 1000;
const MINUTE_SECONDS = 60;

export const rateLimitPlanKey = (workspaceId: string) => `rate-limit-plan:v1:${workspaceId}`;

/** Durable Object name for one policy allowance. */
export function rateLimitPolicyScopeKey(workspaceId: string, policyId: string, scope: string): string {
	return `rate-limit-policy:v1:${workspaceId}:${policyId}:${scope}`;
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value)
		&& Object.values(value as Record<string, unknown>).every((item) => typeof item === "string");
}

export function isRateLimitPlan(value: unknown): value is RateLimitPlan {
	if (!value || typeof value !== "object") return false;
	const plan = value as Partial<RateLimitPlan>;
	if (plan.v !== 1 || !plan.policies || typeof plan.policies !== "object") return false;
	const policiesValid = Object.values(plan.policies).every((policy) => Boolean(policy) && typeof policy.name === "string"
		&& (policy.rpm === null || (typeof policy.rpm === "number" && Number.isSafeInteger(policy.rpm) && policy.rpm > 0)));
	return policiesValid && isStringRecord(plan.keys) && isStringRecord(plan.members) && isStringRecord(plan.guardrails)
		&& (plan.endUserDefault === null || typeof plan.endUserDefault === "string");
}

function isEmptyPlan(plan: RateLimitPlan): boolean {
	return !plan.endUserDefault && !Object.keys(plan.keys).length && !Object.keys(plan.members).length
		&& !Object.keys(plan.guardrails).length;
}

async function readAll<T>(table: string, columns: string, workspaceId: string): Promise<T[]> {
	const rows: T[] = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await getSupabaseAdmin().from(table).select(columns)
			.eq("workspace_id", workspaceId).order("id", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);
		if (error) throw new Error(error.message || `Failed to read ${table}`);
		const page = (data ?? []) as T[];
		rows.push(...page);
		if (page.length < PAGE_SIZE) return rows;
	}
}

type PolicyRow = { id: string; name: string; requests_per_minute: number | null };
type AssignmentRow = {
	policy_id: string;
	target_type: string;
	key_id: string | null;
	user_id: string | null;
	guardrail_id: string | null;
};

/** Reads a workspace's policies and assignments. Department assignments are not enforced yet and are omitted. */
export async function buildRateLimitPlan(workspaceId: string): Promise<RateLimitPlan> {
	const [policies, assignments] = await Promise.all([
		readAll<PolicyRow>("workspace_rate_limit_policies", "id,name,requests_per_minute", workspaceId),
		readAll<AssignmentRow>("workspace_rate_limit_policy_assignments", "id,policy_id,target_type,key_id,user_id,guardrail_id", workspaceId),
	]);
	const known = new Map(policies.map((policy) => [policy.id, policy]));
	const plan: RateLimitPlan = { v: 1, policies: {}, keys: {}, members: {}, guardrails: {}, endUserDefault: null };
	for (const assignment of assignments) {
		const policy = known.get(assignment.policy_id);
		if (!policy) continue;
		if (assignment.target_type === "key" && assignment.key_id) plan.keys[assignment.key_id] = policy.id;
		else if (assignment.target_type === "member" && assignment.user_id) plan.members[assignment.user_id] = policy.id;
		else if (assignment.target_type === "guardrail" && assignment.guardrail_id) plan.guardrails[assignment.guardrail_id] = policy.id;
		else if (assignment.target_type === "end_user_default") plan.endUserDefault = policy.id;
		else continue;
		plan.policies[policy.id] = {
			rpm: policy.requests_per_minute == null ? null : Number(policy.requests_per_minute),
			name: policy.name,
		};
	}
	return plan;
}

/**
 * Rebuilds and stores the workspace's plan after a policy or assignment change.
 * Never throws: the database change has already happened, so a failure is
 * logged and the previous plan stays in force until the next successful publish.
 */
export async function publishRateLimitPlan(workspaceId: string): Promise<boolean> {
	try {
		const plan = await buildRateLimitPlan(workspaceId);
		const kv = getCache();
		const key = rateLimitPlanKey(workspaceId);
		// Same envelope as the tiered cache's KV layer (`{ v, at }`).
		if (isEmptyPlan(plan)) await kv.delete(key);
		else await kv.put(key, JSON.stringify({ v: plan, at: Date.now() }));
		invalidateTieredL1(key);
		return true;
	} catch (error) {
		console.error("rate_limit_plan_publish_failed", {
			workspaceId,
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
}

/**
 * Copies a rotated key's policy assignment to its replacement. Returns whether
 * an assignment was copied; throws if it could not be read or written.
 */
export async function copyKeyRateLimitAssignment(args: {
	workspaceId: string;
	fromKeyId: string;
	toKeyId: string;
	createdBy: string | null;
}): Promise<boolean> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase.from("workspace_rate_limit_policy_assignments").select("policy_id")
		.eq("workspace_id", args.workspaceId).eq("target_type", "key").eq("key_id", args.fromKeyId).maybeSingle();
	if (error) throw new Error(error.message || "Failed to read the key's rate limit assignment");
	if (!data) return false;
	const { error: insertError } = await supabase.from("workspace_rate_limit_policy_assignments").insert({
		workspace_id: args.workspaceId,
		policy_id: (data as { policy_id: string }).policy_id,
		target_type: "key",
		key_id: args.toKeyId,
		created_by: args.createdBy,
	});
	if (insertError) throw new Error(insertError.message || "Failed to copy the key's rate limit assignment");
	return true;
}

/** The workspace's published plan, or null when it has none. Never throws (fails open). */
export async function readRateLimitPlan(workspaceId: string): Promise<RateLimitPlan | null> {
	try {
		return await tieredRead<RateLimitPlan>({
			key: rateLimitPlanKey(workspaceId),
			// Only the control API publishes plans; a missing key means no policies.
			loader: async () => null,
			l1FreshMs: 60_000,
			negativeFreshMs: 30_000,
			l2: false,
			l3: { freshS: 60 },
			isShareable: () => false,
			isFreshInL3: () => true,
			validate: isRateLimitPlan,
		});
	} catch (error) {
		console.warn("rate_limit_plan_read_failed", {
			workspaceId,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

/**
 * Policies that apply to one request. Every entry is a separate allowance and
 * all are counted, so the most restrictive one rejects first. A guardrail
 * policy gives each key (or OAuth user) it covers its own allowance.
 */
export function applicableRateLimits(plan: RateLimitPlan | null, subject: {
	keyId?: string | null;
	userId?: string | null;
	authMethodIsOAuth?: boolean;
	guardrailIds?: string[] | null;
	endUserId?: string | null;
}): ApplicableRateLimit[] {
	if (!plan) return [];
	const limits: ApplicableRateLimit[] = [];
	const add = (policyId: string | null | undefined, targetType: RateLimitTarget, scopeKey: string) => {
		const policy = policyId ? plan.policies[policyId] : undefined;
		if (!policyId || !policy || policy.rpm == null) return;
		limits.push({ policyId, name: policy.name, targetType, rpm: policy.rpm, scopeKey });
	};
	// OAuth requests carry the OAuth client ID in place of a key ID.
	const keyId = subject.authMethodIsOAuth ? null : subject.keyId || null;
	const userId = subject.userId || null;
	if (keyId) add(plan.keys[keyId], "key", `key:${keyId}`);
	if (userId) add(plan.members[userId], "member", `member:${userId}`);
	const guardrailSubject = keyId ? `key:${keyId}` : userId ? `user:${userId}` : null;
	if (guardrailSubject) {
		for (const guardrailId of new Set(subject.guardrailIds ?? [])) {
			add(plan.guardrails[guardrailId], "guardrail", `guardrail:${guardrailId}:${guardrailSubject}`);
		}
	}
	if (subject.endUserId) add(plan.endUserDefault, "end_user", `end-user:${subject.endUserId}`);
	return limits;
}

type RequestLimits = {
	admissionId: string;
	limits: Array<ApplicableRateLimit & { quotaKey: string }>;
	denied: (PolicyQuotaDenial & { entry: ApplicableRateLimit }) | null;
};

/** Plan resolution happens once per request context, not once per provider attempt. */
const pendingLimits = new WeakMap<PipelineContext, Promise<RequestLimits | null>>();
const resolvedLimits = new WeakMap<PipelineContext, RequestLimits>();

async function resolveRequestLimits(ctx: PipelineContext): Promise<RequestLimits | null> {
	const plan = await readRateLimitPlan(ctx.workspaceId);
	const limits = applicableRateLimits(plan, {
		keyId: ctx.keyId,
		userId: ctx.quotaUserId,
		authMethodIsOAuth: ctx.meta?.authMethod === "oauth",
		guardrailIds: ctx.activeGuardrailIds,
		endUserId: ctx.meta?.requestUserId,
	});
	if (!limits.length) return null;
	const state: RequestLimits = {
		admissionId: ctx.rateLimitAdmissionId ?? ctx.billingRequestId,
		limits: limits.map((limit) => ({ ...limit, quotaKey: rateLimitPolicyScopeKey(ctx.workspaceId, limit.policyId, limit.scopeKey) })),
		denied: null,
	};
	resolvedLimits.set(ctx, state);
	return state;
}

function limitedSubject(entry: ApplicableRateLimit): string {
	if (entry.targetType === "member") return "This workspace member";
	if (entry.targetType === "end_user") return "This end user";
	if (entry.targetType === "guardrail") return entry.scopeKey.includes(":user:") ? "This user, through a guardrail," : "This API key, through a guardrail,";
	return "This API key";
}

/**
 * Admits a provider attempt against the workspace's rate limit policies.
 * Called after the response-cache lookup, so cache hits are never counted.
 * Returns the 429 response when a policy allowance is known to be exhausted.
 */
export async function guardRateLimitPolicies(ctx: PipelineContext): Promise<Response | null> {
	if (ctx.internal) return null;
	try {
		return await admitRequest(ctx);
	} catch (error) {
		// Fail open: enforcement must never break the request path.
		console.warn("rate_limit_policy_guard_failed", { error: error instanceof Error ? error.message : String(error) });
		return null;
	}
}

async function admitRequest(ctx: PipelineContext): Promise<Response | null> {
	if (!policyQuotaBindings()) return null;
	let pending = pendingLimits.get(ctx);
	if (!pending) {
		pending = resolveRequestLimits(ctx).catch((error) => {
			console.warn("rate_limit_policy_resolve_failed", { error: error instanceof Error ? error.message : String(error) });
			return null;
		});
		pendingLimits.set(ctx, pending);
	}
	const state = await pending;
	if (!state) return null;
	const denial = admitPolicyQuotas({
		scopes: state.limits.map((limit) => ({ scopeKey: limit.quotaKey, requestsPerMinute: limit.rpm })),
		admissionId: state.admissionId,
	});
	if (!denial) return null;
	const entry = state.limits.find((limit) => limit.quotaKey === denial.scope.scopeKey)!;
	state.denied = { ...denial, entry };
	const response = err("rate_limit_exceeded", {
		request_id: ctx.requestId,
		error_origin: "user",
		reason: "policy_requests_per_minute",
		policy_id: entry.policyId,
		limit_scope: entry.targetType,
		description: `${limitedSubject(entry)} reached the "${entry.name}" rate limit policy's ${denial.limit} requests per minute. Retry after ${denial.retryAfterSeconds} seconds.`,
	});
	response.headers.set("Retry-After", String(denial.retryAfterSeconds));
	for (const [name, value] of Object.entries(rateLimitPolicyHeaders(ctx) ?? {})) response.headers.set(name, value);
	return response;
}

/**
 * OpenAI-style request rate-limit headers for the most restrictive policy that
 * applied to this request, or null when none did (or the request never reached
 * enforcement, e.g. a cache hit).
 *
 * Counting is non-blocking, so the values are approximate: `remaining` is what
 * this isolate last heard from the scope's counter, less one if that report
 * predates this request's own count, and `limit - 1` before any report.
 * `reset` is when the next request will be accepted once nothing remains;
 * otherwise 60s, when the rolling window clears this request.
 */
export function rateLimitPolicyHeaders(ctx: PipelineContext): Record<string, string> | null {
	const state = resolvedLimits.get(ctx);
	if (!state || !state.limits.length) return null;
	let chosen: { limit: number; remaining: number; reset: number } | null = null;
	if (state.denied) {
		chosen = { limit: state.denied.limit, remaining: 0, reset: state.denied.retryAfterSeconds };
	} else {
		const now = Date.now();
		for (const entry of state.limits) {
			const report = policyQuotaReport(entry.quotaKey);
			const elapsedSeconds = report ? (now - report.at) / 1000 : Infinity;
			const fresh = report && elapsedSeconds < MINUTE_SECONDS ? report : null;
			const limit = fresh?.limit ?? entry.rpm;
			const remaining = fresh
				? Math.max(0, fresh.remaining - (fresh.admissionId === state.admissionId ? 0 : 1))
				: Math.max(0, limit - 1);
			const reset = remaining === 0 && fresh && fresh.retryAfterSeconds > 0
				? Math.max(1, Math.ceil(fresh.retryAfterSeconds - elapsedSeconds))
				: MINUTE_SECONDS;
			if (!chosen || remaining < chosen.remaining || (remaining === chosen.remaining && limit < chosen.limit)) {
				chosen = { limit, remaining, reset };
			}
		}
	}
	if (!chosen) return null;
	return {
		"x-ratelimit-limit-requests": String(chosen.limit),
		"x-ratelimit-remaining-requests": String(chosen.remaining),
		"x-ratelimit-reset-requests": `${chosen.reset}s`,
	};
}

/** True when this request was rejected by a rate limit policy (other models would be rejected too). */
export function rejectedByRateLimitPolicy(ctx: PipelineContext): boolean {
	return Boolean(resolvedLimits.get(ctx)?.denied);
}

/** Adds the policy headers to the response delivered for `ctx`. */
export function withRateLimitPolicyHeaders(response: Response, ctx: PipelineContext): Response {
	const headers = rateLimitPolicyHeaders(ctx);
	if (!headers || response.status === 101) return response;
	try {
		for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
		return response;
	} catch {
		// Proxied responses may carry immutable headers.
		const copy = new Headers(response.headers);
		for (const [name, value] of Object.entries(headers)) copy.set(name, value);
		return new Response(response.body, { status: response.status, statusText: response.statusText, headers: copy });
	}
}

export const RATE_LIMIT_POLICY_HEADERS = [
	"x-ratelimit-limit-requests",
	"x-ratelimit-remaining-requests",
	"x-ratelimit-reset-requests",
];
