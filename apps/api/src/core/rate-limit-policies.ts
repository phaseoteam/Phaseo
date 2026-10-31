// Purpose: Enforce workspace rate limit policies (requests and tokens per minute, concurrent requests) on the request path.
// Why: Admins assign named limits to keys, members, departments, guardrails and end users;
//      the request path must apply them without Postgres or added latency.
// How: The control API publishes a compact per-workspace plan to KV after
//      every change (`rate-limit-plan:v1:{workspace}`; no key means no
//      policies). Requests read it through the tiered cache (isolate memory for
//      about a minute, then KV; a copy unchecked for two minutes is reread
//      before use), resolve the policies that apply, and admit
//      them through the customer limiter (core/customer-rate-limits.ts): each
//      applicable scope is counted exactly by its own CustomerRateLimit Durable
//      Object, and a scope the isolate knows is exhausted is rejected locally.
//      Changes therefore take effect within about a minute; a scheduled
//      reconcile republishes every workspace so a missed or out-of-order
//      publish cannot persist. Tokens per minute are charged with each
//      request's real usage once it completes (chargeRateLimitPolicyTokens),
//      so requests already in flight can take an allowance past its limit.
//      A department policy is one allowance shared by everything that counts
//      toward the department (see departmentsFor); the plan carries the key
//      and member department links it needs, so membership changes made
//      outside this API reach the gateway with the next reconcile.
//      A concurrency limit holds a slot per request in flight, awaited at
//      admission and released by the entrypoint once the response is
//      delivered (pipeline/index.ts); requests outside that entrypoint are
//      not limited by concurrency. A strict (fail_closed) policy awaits its
//      checks and rejects when its counter cannot answer. Anything else that
//      fails, including reading the plan, admits the request.
import { getCache, getSupabaseAdmin } from "@/runtime/env";
import { resolveCanonicalTokenUsage } from "@core/usage-normalization";
import { keyIdIsOAuthClientId } from "@core/request-key";
import { invalidateTieredL1, tieredRead } from "@core/tiered-cache";
import {
	admitPolicyQuotas, chargePolicyTokens, policyQuotaBindings, policyQuotaReport,
	type PolicyQuotaDenial,
} from "@core/customer-rate-limits";
import { err } from "@pipeline/before/http";
import type { PipelineContext } from "@pipeline/before/types";

export type RateLimitPlan = {
	v: 1;
	/** `tpm` is absent from plans published before tokens per minute were enforced. */
	/** `cc` and `strict` are present only when set, and absent from plans published before they were enforced. */
	policies: Record<string, { rpm: number | null; tpm?: number | null; cc?: number | null; strict?: boolean; name: string }>;
	keys: Record<string, string>;
	members: Record<string, string>;
	guardrails: Record<string, string>;
	endUserDefault: string | null;
	/** Department ID -> policy ID. Absent from plans published before department limits were enforced. */
	departments?: Record<string, string>;
	/** Key ID -> the department the key is linked to. Present when `departments` is non-empty. */
	keyDepartments?: Record<string, string>;
	/** User ID -> the departments with a policy that the user counts toward. */
	memberDepartments?: Record<string, string[]>;
};

export type RateLimitTarget = "key" | "member" | "department" | "guardrail" | "end_user";

export type ApplicableRateLimit = {
	policyId: string;
	name: string;
	targetType: RateLimitTarget;
	rpm: number | null;
	tpm: number | null;
	/** Concurrent requests; present only when the policy sets it. */
	cc?: number;
	/** Present (true) only for fail-closed policies. */
	strict?: true;
	/** Subject within the policy, e.g. `key:{keyId}`. */
	scopeKey: string;
};

const PAGE_SIZE = 1000;
const MAX_PUBLISH_ATTEMPTS = 3;
/** Upper bound on workspaces republished by one scheduled reconcile run. */
const MAX_RECONCILE_WORKSPACES = 2000;
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
	const limitValid = (value: unknown) => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
	const policiesValid = Object.values(plan.policies).every((policy) => Boolean(policy) && typeof policy.name === "string"
		&& limitValid(policy.rpm) && (policy.tpm === undefined || limitValid(policy.tpm))
		&& (policy.cc === undefined || limitValid(policy.cc)) && (policy.strict === undefined || typeof policy.strict === "boolean"));
	const memberDepartmentsValid = plan.memberDepartments === undefined || (Boolean(plan.memberDepartments)
		&& typeof plan.memberDepartments === "object" && !Array.isArray(plan.memberDepartments)
		&& Object.values(plan.memberDepartments).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string")));
	return policiesValid && isStringRecord(plan.keys) && isStringRecord(plan.members) && isStringRecord(plan.guardrails)
		&& (plan.endUserDefault === null || typeof plan.endUserDefault === "string")
		&& (plan.departments === undefined || isStringRecord(plan.departments))
		&& (plan.keyDepartments === undefined || isStringRecord(plan.keyDepartments))
		&& memberDepartmentsValid;
}

function isEmptyPlan(plan: RateLimitPlan): boolean {
	return !plan.endUserDefault && !Object.keys(plan.keys).length && !Object.keys(plan.members).length
		&& !Object.keys(plan.guardrails).length && !Object.keys(plan.departments ?? {}).length;
}

type ReadFilter = (query: any) => any;

async function readAll<T>(table: string, columns: string, workspaceId: string, options: { order?: string[]; filter?: ReadFilter } = {}): Promise<T[]> {
	const rows: T[] = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		let query = getSupabaseAdmin().from(table).select(columns).eq("workspace_id", workspaceId);
		if (options.filter) query = options.filter(query);
		for (const column of options.order ?? ["id"]) query = query.order(column, { ascending: true });
		const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
		if (error) throw new Error(error.message || `Failed to read ${table}`);
		const page = (data ?? []) as T[];
		rows.push(...page);
		if (page.length < PAGE_SIZE) return rows;
	}
}

type PolicyRow = {
	id: string;
	name: string;
	requests_per_minute: number | null;
	tokens_per_minute: number | string | null;
	concurrent_requests?: number | null;
	fail_closed?: boolean | null;
};
type AssignmentRow = {
	policy_id: string;
	target_type: string;
	key_id: string | null;
	user_id: string | null;
	department_id: string | null;
	guardrail_id: string | null;
};

/** Reads a workspace's policies and assignments, plus the department links department policies need. */
export async function buildRateLimitPlan(workspaceId: string): Promise<RateLimitPlan> {
	const [policies, assignments] = await Promise.all([
		readAll<PolicyRow>("workspace_rate_limit_policies", "id,name,requests_per_minute,tokens_per_minute,concurrent_requests,fail_closed", workspaceId),
		readAll<AssignmentRow>("workspace_rate_limit_policy_assignments", "id,policy_id,target_type,key_id,user_id,department_id,guardrail_id", workspaceId),
	]);
	const known = new Map(policies.map((policy) => [policy.id, policy]));
	const plan: RateLimitPlan = { v: 1, policies: {}, keys: {}, members: {}, guardrails: {}, endUserDefault: null };
	const departments: Record<string, string> = {};
	for (const assignment of assignments) {
		const policy = known.get(assignment.policy_id);
		if (!policy) continue;
		if (assignment.target_type === "key" && assignment.key_id) plan.keys[assignment.key_id] = policy.id;
		else if (assignment.target_type === "member" && assignment.user_id) plan.members[assignment.user_id] = policy.id;
		else if (assignment.target_type === "department" && assignment.department_id) departments[assignment.department_id] = policy.id;
		else if (assignment.target_type === "guardrail" && assignment.guardrail_id) plan.guardrails[assignment.guardrail_id] = policy.id;
		else if (assignment.target_type === "end_user_default") plan.endUserDefault = policy.id;
		else continue;
		plan.policies[policy.id] = {
			rpm: policy.requests_per_minute == null ? null : Number(policy.requests_per_minute),
			tpm: policy.tokens_per_minute == null ? null : Number(policy.tokens_per_minute),
			...(policy.concurrent_requests == null ? {} : { cc: Number(policy.concurrent_requests) }),
			...(policy.fail_closed ? { strict: true } : {}),
			name: policy.name,
		};
	}
	if (Object.keys(departments).length) Object.assign(plan, { departments, ...await readDepartmentLinks(workspaceId, departments) });
	return plan;
}

/**
 * Which departments each key and member counts toward. A key linked to a
 * department counts toward that one only, even when it has no policy. Every
 * other key counts toward its creator's departments, as OAuth requests count
 * toward their user's: the override department when the member has a manual
 * department override, otherwise every department they belong to, or only
 * their primary one when the workspace's department_spend_attribution is
 * "primary" (ranked as private.spend_scope_departments ranks grants). Only
 * departments with a policy are kept for members.
 */
async function readDepartmentLinks(workspaceId: string, departments: Record<string, string>) {
	const limited = Object.keys(departments);
	const primaryOnly = await readPrimaryOnlyAttribution(workspaceId);
	const [keys, allGrants, overrides] = await Promise.all([
		readAll<{ id: string; department_id: string }>("keys", "id,department_id", workspaceId, {
			filter: (query) => query.not("department_id", "is", null),
		}),
		// Picking the primary grant needs all of a member's grants, not only those of limited departments.
		readAll<GrantRow>("workspace_department_grants", "user_id,department_id,source_type,is_primary,created_at", workspaceId, {
			filter: primaryOnly ? undefined : (query) => query.in("department_id", limited),
			order: ["user_id", "department_id", "source_type", "source_id"],
		}),
		readAll<{ user_id: string; department_id: string | null }>("workspace_member_overrides", "user_id,department_id", workspaceId, {
			filter: (query) => query.eq("department_override_enabled", true),
			order: ["user_id"],
		}),
	]);
	const grants = primaryOnly ? primaryGrants(allGrants) : allGrants;
	const keyDepartments: Record<string, string> = {};
	for (const key of keys) keyDepartments[key.id] = key.department_id;
	const overridden = new Map(overrides.map((override) => [override.user_id, override.department_id]));
	const memberships = new Map<string, Set<string>>();
	const join = (userId: string, departmentId: string | null) => {
		if (!departmentId || !departments[departmentId]) return;
		const joined = memberships.get(userId) ?? new Set<string>();
		joined.add(departmentId);
		memberships.set(userId, joined);
	};
	for (const grant of grants) if (!overridden.has(grant.user_id)) join(grant.user_id, grant.department_id);
	for (const [userId, departmentId] of overridden) join(userId, departmentId);
	const memberDepartments: Record<string, string[]> = {};
	for (const [userId, joined] of memberships) memberDepartments[userId] = [...joined].sort();
	return { keyDepartments, memberDepartments };
}

type GrantRow = { user_id: string; department_id: string; source_type: string; is_primary: boolean; created_at: string };

async function readPrimaryOnlyAttribution(workspaceId: string): Promise<boolean> {
	const { data, error } = await getSupabaseAdmin().from("workspace_settings").select("department_spend_attribution")
		.eq("workspace_id", workspaceId).maybeSingle();
	if (error) throw new Error(error.message || "Failed to read workspace_settings");
	return (data as { department_spend_attribution?: string } | null)?.department_spend_attribution === "primary";
}

/** Each member's one grant: the primary one, then manual over SCIM, then the oldest. */
function primaryGrants(grants: GrantRow[]): GrantRow[] {
	const rank = (grant: GrantRow) => [grant.is_primary ? 0 : 1, grant.source_type === "manual" ? 0 : 1, Date.parse(grant.created_at)] as const;
	const best = new Map<string, GrantRow>();
	for (const grant of grants) {
		const current = best.get(grant.user_id);
		if (!current) { best.set(grant.user_id, grant); continue; }
		const [a, b] = [rank(grant), rank(current)];
		const order = a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || (grant.department_id < current.department_id ? -1 : 1);
		if (order < 0) best.set(grant.user_id, grant);
	}
	return [...best.values()];
}

/**
 * Rebuilds and stores the workspace's plan after a policy or assignment change.
 * Never throws: the database change has already happened, so a failure is
 * logged and the previous plan stays in force until the next successful publish.
 */
export async function publishRateLimitPlan(workspaceId: string): Promise<boolean> {
	try {
		const kv = getCache();
		const key = rateLimitPlanKey(workspaceId);
		let plan = await buildRateLimitPlan(workspaceId);
		// A concurrent publish that read the database earlier can store its older
		// plan after this one. Re-reading after each write and storing again until
		// nothing changed means the publish that writes last stores the newest
		// state; the scheduled reconcile covers anything still left behind.
		for (let attempt = 0; attempt < MAX_PUBLISH_ATTEMPTS; attempt++) {
			// Same envelope as the tiered cache's KV layer (`{ v, at }`).
			if (isEmptyPlan(plan)) await kv.delete(key);
			else await kv.put(key, JSON.stringify({ v: plan, at: Date.now() }));
			const latest = await buildRateLimitPlan(workspaceId);
			if (JSON.stringify(latest) === JSON.stringify(plan)) break;
			plan = latest;
		}
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
 * Republishes the plan of every workspace that has assignments or a stored
 * plan. Run on a schedule: it backfills workspaces whose assignments predate
 * enforcement, removes plans whose assignments are gone, and repairs any plan
 * an out-of-order publish left stale.
 */
export async function reconcileRateLimitPlans(): Promise<{ workspaces: number; published: number; failed: number; truncated: boolean }> {
	const workspaceIds = new Set<string>();
	for (let offset = 0; workspaceIds.size < MAX_RECONCILE_WORKSPACES; offset += PAGE_SIZE) {
		const { data, error } = await getSupabaseAdmin().from("workspace_rate_limit_policy_assignments").select("workspace_id")
			.order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
		if (error) throw new Error(error.message || "Failed to list rate limit assignments");
		for (const row of (data ?? []) as Array<{ workspace_id: string }>) workspaceIds.add(row.workspace_id);
		if ((data ?? []).length < PAGE_SIZE) break;
	}
	const prefix = rateLimitPlanKey("");
	let cursor: string | undefined;
	do {
		const page = await getCache().list({ prefix, cursor });
		for (const { name } of page.keys) workspaceIds.add(name.slice(prefix.length));
		cursor = page.list_complete ? undefined : (page as { cursor?: string }).cursor;
	} while (cursor && workspaceIds.size < MAX_RECONCILE_WORKSPACES);
	const targets = [...workspaceIds].slice(0, MAX_RECONCILE_WORKSPACES);
	let published = 0;
	for (const workspaceId of targets) {
		if (await publishRateLimitPlan(workspaceId)) published++;
	}
	return {
		workspaces: targets.length,
		published,
		failed: targets.length - published,
		truncated: workspaceIds.size > MAX_RECONCILE_WORKSPACES || Boolean(cursor),
	};
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
			// An isolate that sat idle would otherwise apply the plan it last saw,
			// however old, to its next request before refreshing in the background.
			maxUncheckedMs: 120_000,
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
 * Departments a request counts toward: the key's linked department, otherwise
 * the departments of the key's creator (or the OAuth user).
 */
function departmentsFor(plan: RateLimitPlan, keyId: string | null, userId: string | null): string[] {
	if (!plan.departments) return [];
	const linked = keyId ? plan.keyDepartments?.[keyId] : undefined;
	if (linked) return [linked];
	return userId ? plan.memberDepartments?.[userId] ?? [] : [];
}

/**
 * Policies that apply to one request. Every entry is a separate allowance and
 * all are counted, so the most restrictive one rejects first. A guardrail
 * policy gives each key (or OAuth user) it covers its own allowance; a
 * department policy is one allowance for the whole department.
 */
export function applicableRateLimits(plan: RateLimitPlan | null, subject: {
	keyId?: string | null;
	userId?: string | null;
	keyIdIsOAuthClient?: boolean;
	guardrailIds?: string[] | null;
	endUserId?: string | null;
}): ApplicableRateLimit[] {
	if (!plan) return [];
	const limits: ApplicableRateLimit[] = [];
	const add = (policyId: string | null | undefined, targetType: RateLimitTarget, scopeKey: string) => {
		const policy = policyId ? plan.policies[policyId] : undefined;
		const tpm = policy?.tpm ?? null;
		const cc = policy?.cc ?? null;
		if (!policyId || !policy || (policy.rpm == null && tpm == null && cc == null)) return;
		limits.push({
			policyId, name: policy.name, targetType, rpm: policy.rpm, tpm,
			...(cc == null ? {} : { cc }), ...(policy.strict ? { strict: true as const } : {}),
			scopeKey,
		});
	};
	// OAuth access tokens carry the OAuth client ID in place of a key ID.
	const keyId = subject.keyIdIsOAuthClient ? null : subject.keyId || null;
	const userId = subject.userId || null;
	if (keyId) add(plan.keys[keyId], "key", `key:${keyId}`);
	if (userId) add(plan.members[userId], "member", `member:${userId}`);
	for (const departmentId of departmentsFor(plan, keyId, userId)) {
		add(plan.departments?.[departmentId], "department", `department:${departmentId}`);
	}
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
		keyIdIsOAuthClient: keyIdIsOAuthClientId(ctx.meta?.apiKeyRef),
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
	if (entry.targetType === "department") return "This request's department";
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
	// Classifier calls are billed but must not use up the caller's own allowance.
	if (ctx.internal || ctx.classifierSubrequest) return null;
	try {
		return await admitRequest(ctx);
	} catch (error) {
		// Fail open: enforcement must never break the request path.
		console.warn("rate_limit_policy_guard_failed", { error: error instanceof Error ? error.message : String(error) });
		return null;
	}
}

function policyScopes(state: RequestLimits) {
	return state.limits.map((limit) => ({
		scopeKey: limit.quotaKey,
		requestsPerMinute: limit.rpm,
		tokensPerMinute: limit.tpm,
		concurrentRequests: limit.cc ?? null,
		strict: limit.strict === true,
	}));
}

/**
 * Charges an attempt's token usage to the tokens-per-minute allowances that
 * applied to its request. `usage` may list several candidates (e.g. a failed
 * response's billed usage and its error payload); the largest counts. Each
 * `attempt` is charged once however many settlement paths report it: the
 * default "final" covers the attempt whose response was delivered, and a
 * failed attempt before a provider fallback passes its own key. Never throws.
 */
export function chargeRateLimitPolicyTokens(ctx: PipelineContext, usage: unknown, attempt = "final"): void {
	try {
		const state = resolvedLimits.get(ctx);
		if (!state || state.denied || !state.limits.some((limit) => limit.tpm != null)) return;
		const meta = ctx.meta as Record<string, unknown>;
		const charged = meta.__rateLimitPolicyTokensCharged instanceof Set ? meta.__rateLimitPolicyTokensCharged as Set<string> : new Set<string>();
		if (charged.has(attempt)) return;
		const candidates = Array.isArray(usage) ? usage : [usage];
		const tokens = Math.max(0, ...candidates.map((candidate) => resolveCanonicalTokenUsage(candidate).totalTokens));
		if (!Number.isSafeInteger(tokens) || tokens <= 0) return;
		charged.add(attempt);
		meta.__rateLimitPolicyTokensCharged = charged;
		chargePolicyTokens({ scopes: policyScopes(state), admissionId: state.admissionId, tokens });
	} catch (error) {
		console.warn("rate_limit_policy_token_charge_failed", { error: error instanceof Error ? error.message : String(error) });
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
	const denial = await admitPolicyQuotas({ scopes: policyScopes(state), admissionId: state.admissionId, leases: ctx.rateLimitConcurrency ?? null });
	if (!denial) return null;
	const entry = state.limits.find((limit) => limit.quotaKey === denial.scope.scopeKey)!;
	state.denied = { ...denial, entry };
	const response = err("rate_limit_exceeded", {
		request_id: ctx.requestId,
		error_origin: "user",
		reason: DENIAL_REASONS[denial.kind],
		policy_id: entry.policyId,
		limit_scope: entry.targetType,
		description: denialDescription(entry, denial),
	});
	response.headers.set("Retry-After", String(denial.retryAfterSeconds));
	for (const [name, value] of Object.entries(rateLimitPolicyHeaders(ctx) ?? {})) response.headers.set(name, value);
	return response;
}

/** The `reason` of a policy rejection; see isRateLimitPolicyRejection and rateLimitPolicyRejection. */
export const DENIAL_REASONS: Record<PolicyQuotaDenial["kind"], string> = {
	requests: "policy_requests_per_minute",
	tokens: "policy_tokens_per_minute",
	concurrent_requests: "policy_concurrent_requests",
	unavailable: "policy_unavailable",
};

/** "1 request", "2 requests". */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function denialDescription(entry: ApplicableRateLimit, denial: PolicyQuotaDenial): string {
	const retry = `Retry after ${count(denial.retryAfterSeconds, "second")}.`;
	if (denial.kind === "concurrent_requests") {
		return `${limitedSubject(entry)} already has ${count(denial.limit, "request")} in progress, the "${entry.name}" rate limit policy's limit on concurrent requests. ${retry}`;
	}
	if (denial.kind === "unavailable") {
		return `The "${entry.name}" rate limit policy is strict, and its limits could not be checked just now, so the request was not sent. ${retry}`;
	}
	return `${limitedSubject(entry)} reached the "${entry.name}" rate limit policy's ${count(denial.limit, denial.kind === "tokens" ? "token" : "request")} per minute. ${retry}`;
}

type HeaderValues = { limit: number; remaining: number; reset: number };

/** Approximate values for one allowance from what this isolate last heard from its counter. */
function reportedValues(report: ReturnType<typeof policyQuotaReport>, limit: number, admissionId: string, ownCost: number, now: number): HeaderValues {
	const elapsedSeconds = report ? (now - report.at) / 1000 : Infinity;
	const fresh = report && elapsedSeconds < MINUTE_SECONDS ? report : null;
	const reportedLimit = fresh?.limit ?? limit;
	const remaining = fresh
		? Math.max(0, fresh.remaining - (fresh.admissionId === admissionId ? 0 : ownCost))
		: Math.max(0, reportedLimit - ownCost);
	const reset = remaining === 0 && fresh && fresh.retryAfterSeconds > 0
		? Math.max(1, Math.ceil(fresh.retryAfterSeconds - elapsedSeconds))
		: MINUTE_SECONDS;
	return { limit: reportedLimit, remaining, reset };
}

function tighter(chosen: HeaderValues | null, next: HeaderValues): HeaderValues {
	return !chosen || next.remaining < chosen.remaining || (next.remaining === chosen.remaining && next.limit < chosen.limit) ? next : chosen;
}

/**
 * OpenAI-style rate-limit headers for the most restrictive request allowance
 * and the most restrictive token allowance that applied to this request, or
 * null when none did (or the request never reached enforcement, e.g. a cache
 * hit). A rejected request reports only the allowance that rejected it.
 *
 * Counting is non-blocking, so the values are approximate. For requests,
 * `remaining` is what this isolate last heard from the scope's counter, less
 * one if that report predates this request's own count, and `limit - 1`
 * before any report. For tokens it is what the counter last reported; this
 * request's own usage is charged after it completes. `reset` is when the
 * allowance frees up once nothing remains; otherwise 60s, the rolling window.
 */
export function rateLimitPolicyHeaders(ctx: PipelineContext): Record<string, string> | null {
	const state = resolvedLimits.get(ctx);
	if (!state || !state.limits.length) return null;
	let requests: HeaderValues | null = null;
	let tokens: HeaderValues | null = null;
	if (state.denied) {
		// Concurrency and strict-mode refusals have no per-minute allowance to report.
		const denied = { limit: state.denied.limit, remaining: 0, reset: state.denied.retryAfterSeconds };
		if (state.denied.kind === "tokens") tokens = denied;
		else if (state.denied.kind === "requests") requests = denied;
	} else {
		const now = Date.now();
		for (const entry of state.limits) {
			if (entry.rpm != null) requests = tighter(requests, reportedValues(policyQuotaReport(entry.quotaKey), entry.rpm, state.admissionId, 1, now));
			if (entry.tpm != null) tokens = tighter(tokens, reportedValues(policyQuotaReport(entry.quotaKey, "tokens"), entry.tpm, state.admissionId, 0, now));
		}
	}
	const headers: Record<string, string> = {};
	if (requests) {
		headers["x-ratelimit-limit-requests"] = String(requests.limit);
		headers["x-ratelimit-remaining-requests"] = String(requests.remaining);
		headers["x-ratelimit-reset-requests"] = `${requests.reset}s`;
	}
	if (tokens) {
		headers["x-ratelimit-limit-tokens"] = String(tokens.limit);
		headers["x-ratelimit-remaining-tokens"] = String(tokens.remaining);
		headers["x-ratelimit-reset-tokens"] = `${tokens.reset}s`;
	}
	return Object.keys(headers).length ? headers : null;
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
	"x-ratelimit-limit-tokens",
	"x-ratelimit-remaining-tokens",
	"x-ratelimit-reset-tokens",
];
