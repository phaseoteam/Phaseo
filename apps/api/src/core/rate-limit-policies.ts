// Purpose: Enforce rate guardrails (requests and tokens per minute, concurrent requests) on the request path.
// Why: Admins assign rate guardrails to the whole workspace, departments, members and keys,
//      counted as one shared allowance, one per key or one per end user; the request path
//      must apply them without Postgres or added latency. (Rate guardrails replaced rate limit
//      policies, kept their ids, and are still called policies in this module and its API.)
// How: The control API publishes a compact per-workspace plan to KV after
//      every change it makes, and the workspace publication drain republishes it
//      after any other change to guardrails, assignments or departments
//      (`rate-limit-plan:v2:{workspace}`; no key means no rate guardrails). Requests read it through the tiered cache (isolate memory for
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
//      Department guardrails reach everything that counts toward the
//      department (see departmentsFor); the plan carries the key and member
//      department links it needs.
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

/**
 * How a rate guardrail counts. Absent: made through the rate limits API, which has no counting
 * field, so it counts as rate limit policies did: one allowance per key, member or department it is
 * assigned to, and one per end user when assigned to the whole workspace.
 */
export type RateCounting = "shared" | "each_key" | "each_end_user";
const RATE_COUNTINGS: readonly string[] = ["shared", "each_key", "each_end_user"];

export type RateLimitPlan = {
	v: 2;
	/** Rate guardrails by id. `cc`, `strict` and `counting` are present only when set. */
	policies: Record<string, { rpm: number | null; tpm: number | null; cc?: number; strict?: true; counting?: RateCounting; name: string }>;
	/** Rate guardrails assigned to the whole workspace. */
	workspace: string[];
	/** Key ID -> its rate guardrails. */
	keys: Record<string, string[]>;
	/** User ID -> the rate guardrails of that member (the principal of their keys, or the OAuth user). */
	members: Record<string, string[]>;
	/** Department ID -> its rate guardrails. Present when non-empty. */
	departments?: Record<string, string[]>;
	/** Key ID -> the department the key is linked to. Present when `departments` is. */
	keyDepartments?: Record<string, string>;
	/** User ID -> the departments with a rate guardrail that the user counts toward. */
	memberDepartments?: Record<string, string[]>;
};

/** The counter a rejection came from: `workspace` is a shared workspace allowance. */
export type RateLimitTarget = "key" | "member" | "department" | "workspace" | "end_user";

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

// v2 plans are built from rate guardrails; nothing reads the v1 keys rate limit policies left in KV.
export const rateLimitPlanKey = (workspaceId: string) => `rate-limit-plan:v2:${workspaceId}`;

/**
 * Durable Object name for one allowance. Rate guardrails kept the ids of the policies they
 * replaced, and the scopes are the ones policies used, so their counters carry over.
 */
export function rateLimitPolicyScopeKey(workspaceId: string, policyId: string, scope: string): string {
	return `rate-limit-policy:v1:${workspaceId}:${policyId}:${scope}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.every((id) => typeof id === "string");

function isIdListRecord(value: unknown): value is Record<string, string[]> {
	return isRecord(value) && Object.values(value).every(isIdList);
}

export function isRateLimitPlan(value: unknown): value is RateLimitPlan {
	if (!isRecord(value)) return false;
	const plan = value as Partial<RateLimitPlan>;
	if (plan.v !== 2 || !isRecord(plan.policies)) return false;
	const limitValid = (value: unknown) => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
	const policiesValid = Object.values(plan.policies).every((policy) => isRecord(policy) && typeof policy.name === "string"
		&& limitValid(policy.rpm) && limitValid(policy.tpm)
		&& (policy.cc === undefined || limitValid(policy.cc)) && (policy.strict === undefined || policy.strict === true)
		&& (policy.counting === undefined || RATE_COUNTINGS.includes(policy.counting)));
	return policiesValid && isIdList(plan.workspace) && isIdListRecord(plan.keys) && isIdListRecord(plan.members)
		&& (plan.departments === undefined || isIdListRecord(plan.departments))
		&& (plan.keyDepartments === undefined || isStringRecord(plan.keyDepartments))
		&& (plan.memberDepartments === undefined || isIdListRecord(plan.memberDepartments));
}

function isEmptyPlan(plan: RateLimitPlan): boolean {
	return !Object.keys(plan.policies).length;
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

/** The rate columns of workspace_guardrails. */
export const RATE_GUARDRAIL_COLUMNS = "id,name,enabled,rate_requests_per_minute,rate_tokens_per_minute,rate_concurrent_requests,rate_fail_closed,rate_counting";

export type RateGuardrailRow = {
	id: string;
	name: string;
	enabled?: boolean | null;
	rate_requests_per_minute: number | null;
	rate_tokens_per_minute: number | string | null;
	rate_concurrent_requests: number | null;
	rate_fail_closed: boolean | null;
	rate_counting: string | null;
};

type AssignmentRow = {
	guardrail_id: string;
	target_type: string;
	target_id: string | null;
};

function append(record: Record<string, string[]>, id: string, guardrailId: string) {
	const ids = record[id] ??= [];
	if (!ids.includes(guardrailId)) ids.push(guardrailId);
}

/** Reads a workspace's enabled rate guardrails and where they are assigned, plus the department links they need. */
export async function buildRateLimitPlan(workspaceId: string): Promise<RateLimitPlan> {
	const guardrails = await readAll<RateGuardrailRow>("workspace_guardrails", RATE_GUARDRAIL_COLUMNS, workspaceId, {
		filter: (query) => query.eq("kind", "rate").eq("enabled", true),
	});
	const plan: RateLimitPlan = { v: 2, policies: {}, workspace: [], keys: {}, members: {} };
	const limited = new Map<string, RateLimitPlan["policies"][string]>();
	for (const guardrail of guardrails) {
		const entry = planPolicy(guardrail);
		if (entry) limited.set(guardrail.id, entry);
	}
	if (!limited.size) return plan;
	const assignments = await readAll<AssignmentRow>("workspace_guardrail_assignments", "guardrail_id,target_type,target_id", workspaceId, {
		filter: (query) => query.in("guardrail_id", [...limited.keys()]),
	});
	const departments: Record<string, string[]> = {};
	for (const { guardrail_id: guardrailId, target_type: type, target_id: targetId } of assignments) {
		const entry = limited.get(guardrailId);
		if (!entry) continue;
		if (type === "workspace") { if (!plan.workspace.includes(guardrailId)) plan.workspace.push(guardrailId); }
		else if (type === "key" && targetId) append(plan.keys, targetId, guardrailId);
		else if (type === "member" && targetId) append(plan.members, targetId, guardrailId);
		else if (type === "department" && targetId) append(departments, targetId, guardrailId);
		else continue;
		plan.policies[guardrailId] = entry;
	}
	if (Object.keys(departments).length) Object.assign(plan, { departments, ...await readDepartmentLinks(workspaceId, departments) });
	return plan;
}

/** The plan entry for a rate guardrail, or null when it limits nothing (which the table's constraint rules out). */
function planPolicy(guardrail: RateGuardrailRow): RateLimitPlan["policies"][string] | null {
	const rpm = guardrail.rate_requests_per_minute == null ? null : Number(guardrail.rate_requests_per_minute);
	const tpm = guardrail.rate_tokens_per_minute == null ? null : Number(guardrail.rate_tokens_per_minute);
	const cc = guardrail.rate_concurrent_requests == null ? null : Number(guardrail.rate_concurrent_requests);
	if (rpm == null && tpm == null && cc == null) return null;
	const counting = guardrail.rate_counting && RATE_COUNTINGS.includes(guardrail.rate_counting) ? guardrail.rate_counting as RateCounting : null;
	return {
		rpm,
		tpm,
		...(cc == null ? {} : { cc }),
		...(guardrail.rate_fail_closed ? { strict: true as const } : {}),
		...(counting ? { counting } : {}),
		name: guardrail.name,
	};
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
async function readDepartmentLinks(workspaceId: string, departments: Record<string, string[]>) {
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
		// Most workspaces have no rate guardrails: nothing to store or remove.
		if (isEmptyPlan(plan) && await kv.get(key) === null) {
			invalidateTieredL1(key);
			return true;
		}
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
		const { data, error } = await getSupabaseAdmin().from("workspace_guardrails").select("workspace_id")
			.eq("kind", "rate").order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
		if (error) throw new Error(error.message || "Failed to list rate guardrails");
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
 * Copies a rotated key's rate guardrails to its replacement. Returns whether
 * any was copied; throws if they could not be read or written. Written to
 * key_guardrails, which workspace_guardrail_assignments is copied from.
 */
export async function copyKeyRateLimitAssignment(args: {
	workspaceId: string;
	fromKeyId: string;
	toKeyId: string;
	createdBy: string | null;
}): Promise<boolean> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase.from("workspace_guardrail_assignments").select("guardrail_id,workspace_guardrails!inner(kind)")
		.eq("workspace_id", args.workspaceId).eq("target_type", "key").eq("target_id", args.fromKeyId)
		.eq("workspace_guardrails.kind", "rate");
	if (error) throw new Error(error.message || "Failed to read the key's rate guardrails");
	const guardrailIds = [...new Set(((data ?? []) as Array<{ guardrail_id: string }>).map((row) => row.guardrail_id))];
	if (!guardrailIds.length) return false;
	const { error: insertError } = await supabase.from("key_guardrails").upsert(
		guardrailIds.map((guardrailId) => ({ key_id: args.toKeyId, guardrail_id: guardrailId })),
		{ onConflict: "key_id,guardrail_id", ignoreDuplicates: true },
	);
	if (insertError) throw new Error(insertError.message || "Failed to copy the key's rate guardrails");
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

type Level = "key" | "member" | "department" | "workspace";

/**
 * Rate guardrails that apply to one request, from its key, its member, its
 * departments and the workspace. Every entry is a separate allowance and all
 * are counted, so the first one used up rejects. Which allowance a guardrail
 * counts against depends on how it counts: shared, the level it is assigned
 * at (the whole department, all of a member's keys, the workspace); each key,
 * the request's key (or OAuth user); each end user, the request's end user
 * (none without one). A guardrail that reaches a request at several levels
 * counts once per distinct allowance.
 */
export function applicableRateLimits(plan: RateLimitPlan | null, subject: {
	keyId?: string | null;
	userId?: string | null;
	keyIdIsOAuthClient?: boolean;
	endUserId?: string | null;
}): ApplicableRateLimit[] {
	if (!plan) return [];
	// OAuth access tokens carry the OAuth client ID in place of a key ID.
	const keyId = subject.keyIdIsOAuthClient ? null : subject.keyId || null;
	const userId = subject.userId || null;
	const endUser = subject.endUserId ? `end-user:${subject.endUserId}` : null;
	const limits: ApplicableRateLimit[] = [];
	const counted = new Set<string>();
	const add = (guardrailId: string, level: Level, levelScope: string) => {
		const policy = plan.policies[guardrailId];
		if (!policy || (policy.rpm == null && policy.tpm == null && policy.cc == null)) return;
		let targetType: RateLimitTarget = level;
		let scopeKey: string | null = levelScope;
		if (policy.counting === "each_key") {
			targetType = keyId ? "key" : "member";
			scopeKey = keyId ? `key:${keyId}` : userId ? `member:${userId}` : null;
		} else if (policy.counting === "each_end_user" || (!policy.counting && level === "workspace")) {
			// Set through the rate limits API, a workspace assignment is the default for each end user.
			targetType = "end_user";
			scopeKey = endUser;
		}
		if (!scopeKey || counted.has(`${guardrailId}|${scopeKey}`)) return;
		counted.add(`${guardrailId}|${scopeKey}`);
		limits.push({
			policyId: guardrailId, name: policy.name, targetType, rpm: policy.rpm, tpm: policy.tpm,
			...(policy.cc == null ? {} : { cc: policy.cc }), ...(policy.strict ? { strict: true as const } : {}),
			scopeKey,
		});
	};
	if (keyId) for (const id of plan.keys[keyId] ?? []) add(id, "key", `key:${keyId}`);
	if (userId) for (const id of plan.members[userId] ?? []) add(id, "member", `member:${userId}`);
	for (const departmentId of departmentsFor(plan, keyId, userId)) {
		for (const id of plan.departments?.[departmentId] ?? []) add(id, "department", `department:${departmentId}`);
	}
	for (const id of plan.workspace) add(id, "workspace", "workspace");
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
	if (entry.targetType === "workspace") return "This workspace";
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
