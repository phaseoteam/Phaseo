// Purpose: Customer request quotas (requests per minute, free-model requests per day).
// Why: Admission must never add latency to the request path.
// How: Requests are admitted immediately and counted exactly by the scope's
//      CustomerRateLimit Durable Object in the background. When the object
//      reports the scope exhausted, this isolate remembers the denial until the
//      window frees up and rejects later requests locally with the 429 contract.
//      A few requests already in flight at the boundary may exceed the limit.
//      The daily free-model allowance is stricter: an isolate that has no recent
//      headroom for a scope (a cold isolate, or one near the limit) awaits the
//      object before admitting, so an exhausted scope cannot get one free request
//      through on every isolate it reaches.
//      Workspace rate limit policies reuse the minute contract per policy scope
//      for requests per minute; tokens per minute are charged after each
//      request completes, and an exhausted token allowance is replayed locally
//      the same way. See core/rate-limit-policies.ts.
//      Two policy settings trade that latency for exactness. A concurrency
//      limit holds a slot in the scope's object for each request in flight,
//      so admission awaits the object; the slot is released when the response
//      finishes, and frees itself after CONCURRENCY_LEASE_TTL_MS if that release
//      is lost. A strict policy awaits its request and token checks too, and
//      rejects the request when the object cannot answer instead of admitting it.
import { captureBackgroundDispatcher, dispatchBackground, ensureRuntimeForBackground, getBindingsIfConfigured } from "@/runtime/env";
import { awaitShared } from "@core/shared-wait";
import type { GatewayBindings } from "@/runtime/env.types";
import { err } from "@pipeline/before/http";
import type { PriceCard } from "@pipeline/pricing/types";
import { isFreePriceCard } from "@pipeline/pricing/free";
import { readCustomerLimits } from "@core/customer-rate-limit-tiers";

export const DEFAULT_CUSTOMER_LIMITS = { requestsPerMinute: 25, freeRequestsPerDay: 1500 };
export type CustomerLimits = typeof DEFAULT_CUSTOMER_LIMITS;
export type CustomerScope = { workspaceId: string; userId?: string | null };
export type CustomerQuotaKind = "minute" | "free-day";
type PolicyQuotaKind = CustomerQuotaKind | "tokens";
export type CustomerAdmission = {
	allowed: boolean;
	limit: number;
	remaining: number;
	/** Seconds until a slot frees up; also set when `allowed` consumed the last slot. */
	retryAfterSeconds: number;
};

export function customerScopeKey(scope: CustomerScope): string {
	return `customer-quota:v1:${scope.workspaceId}:${scope.userId || "workspace"}`;
}

export function parseCustomerLimits(value: unknown): CustomerLimits {
	if (value == null) return { ...DEFAULT_CUSTOMER_LIMITS };
	if (typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_customer_limits");
	const row = value as Record<string, unknown>;
	const limits = { ...DEFAULT_CUSTOMER_LIMITS };
	for (const key of ["requestsPerMinute", "freeRequestsPerDay"] as const) {
		if (row[key] === undefined) continue;
		if (typeof row[key] !== "number" || !Number.isSafeInteger(row[key]) || row[key] <= 0) {
			throw new Error("invalid_customer_limits");
		}
		limits[key] = row[key];
	}
	return limits;
}

type CustomerStub = {
	admit(scopeKey: string, kind: CustomerQuotaKind, admissionId: string, limits: Partial<CustomerLimits>): Promise<CustomerAdmission>;
	chargeTokens(scopeKey: string, tokens: number, tokensPerMinute: number): Promise<CustomerAdmission>;
	peekTokens(scopeKey: string, tokensPerMinute: number): Promise<CustomerAdmission>;
	acquireConcurrency(scopeKey: string, leaseId: string, limit: number, ttlMs: number): Promise<CustomerAdmission>;
	releaseConcurrency(scopeKey: string, leaseId: string): Promise<void>;
};

const MAX_DENIALS = 10_000;
const MAX_ADMISSIONS = 10_000;
/** Fallback attempts of one request reuse its admission ID within this window. */
const ADMISSION_MEMORY_MS = 10 * 60_000;
type Denial = { until: number; limit: number };
/** `${kind}|${scopeKey}` -> remembered denial. Insertion-ordered for eviction. */
const denials = new Map<string, Denial>();
/** `${kind}|${scopeKey}|${admissionId}` -> expiry of an admission already counted here. */
const admissions = new Map<string, number>();
const MAX_HEADROOM = 10_000;
/** Free-day headroom reported by the counter is trusted locally for this long. */
const FREE_DAY_HEADROOM_MS = 60_000;
/** Below this many remaining free requests every admission asks the counter. */
const FREE_DAY_HEADROOM_MARGIN = 20;
/** An unanswered counter call admits (fails open) after this long. */
const FREE_DAY_ADMIT_TIMEOUT_MS = 2_000;
type Headroom = { remaining: number; until: number };
/** scopeKey -> free-day slots this isolate may still admit without asking the counter. */
const freeDayHeadroom = new Map<string, Headroom>();
/** What the counter last reported for a policy scope, for approximate rate-limit headers. */
export type PolicyQuotaReport = CustomerAdmission & { at: number; admissionId: string };
const policyReports = new Map<string, PolicyQuotaReport>();
/** The same, for a policy scope's token allowance. */
const policyTokenReports = new Map<string, PolicyQuotaReport>();
let missingBindingReported = false;

function remember<V>(map: Map<string, V>, key: string, value: V, max: number): void {
	map.delete(key);
	map.set(key, value);
	while (map.size > max) map.delete(map.keys().next().value!);
}

function activeDenial(key: string, now: number): Denial | null {
	const denial = denials.get(key);
	if (!denial) return null;
	if (denial.until > now) return denial;
	denials.delete(key);
	return null;
}

export function __resetCustomerQuotaStateForTests(): void {
	denials.clear();
	admissions.clear();
	freeDayHeadroom.clear();
	policyReports.clear();
	policyTokenReports.clear();
	missingBindingReported = false;
}

export function __customerQuotaStateSizeForTests(): { denials: number; admissions: number } {
	return { denials: denials.size, admissions: admissions.size };
}

/** Records what the counter reported for a scope: a denial to replay locally, or free-day headroom. */
function noteAdmission(kind: PolicyQuotaKind, scopeKey: string, admission: CustomerAdmission): void {
	if (!admission.allowed || (admission.remaining <= 0 && admission.retryAfterSeconds > 0)) {
		const until = Date.now() + Math.max(1, admission.retryAfterSeconds) * 1000;
		remember(denials, `${kind}|${scopeKey}`, { until, limit: admission.limit }, MAX_DENIALS);
	}
	if (kind === "free-day") {
		remember(freeDayHeadroom, scopeKey, { remaining: admission.remaining, until: Date.now() + FREE_DAY_HEADROOM_MS }, MAX_HEADROOM);
	}
}

function quotaExceeded(args: { requestId: string; kind: CustomerQuotaKind }, limit: number, retryAfterSeconds: number): Response {
	const response = err(args.kind === "free-day" ? "phaseo_free_model_limit_exceeded" : "key_limit_exceeded", {
		request_id: args.requestId,
		error_origin: args.kind === "free-day" ? "gateway" : "user",
		reason: args.kind === "minute" ? "customer_requests_per_minute" : "free_requests_per_day",
		description: args.kind === "minute"
			? `This user and workspace have reached their limit of ${limit} requests per minute. Retry after ${retryAfterSeconds} seconds.`
			: `Phaseo free-model daily limit reached. This user and workspace have reached their daily allowance of ${limit} free-model requests, shared across all free models. The allowance resets at 00:00 UTC. Retry after ${retryAfterSeconds} seconds, choose a paid model, or ask your workspace administrator to request a higher limit.`,
	});
	response.headers.set("Retry-After", String(retryAfterSeconds));
	return response;
}

/**
 * With CUSTOMER_RATE_LIMIT_LADDER_ENABLED off, every scope keeps the legacy
 * defaults. When on, the workspace's published trust-ladder tier (or active
 * override) applies, and an unpublished workspace is treated as `new`.
 */
async function customerLimitsFor(bindings: GatewayBindings, workspaceId: string): Promise<CustomerLimits> {
	if (bindings.CUSTOMER_RATE_LIMIT_LADDER_ENABLED !== "true") return { ...DEFAULT_CUSTOMER_LIMITS };
	const { requestsPerMinute, freeRequestsPerDay } = await readCustomerLimits(workspaceId, bindings.CUSTOMER_RATE_LIMIT_LADDER);
	return { requestsPerMinute, freeRequestsPerDay };
}

function countInBackground(bindings: GatewayBindings, scopeKey: string, args: {
	admissionId: string;
	kind: CustomerQuotaKind;
	limits: () => Promise<Partial<CustomerLimits>>;
	onCounted?: (admission: CustomerAdmission) => void;
}): void {
	const namespace = bindings.CUSTOMER_RATE_LIMITS!;
	// The request may finish (and release its runtime) before counting does.
	const release = ensureRuntimeForBackground();
	dispatchBackground((async () => {
		try {
			const limits = await args.limits();
			const stub = namespace.getByName(scopeKey) as unknown as CustomerStub;
			const admission = await stub.admit(scopeKey, args.kind, args.admissionId, limits);
			noteAdmission(args.kind, scopeKey, admission);
			args.onCounted?.(admission);
		} catch (error) {
			// Fail open: the request was already admitted.
			console.warn("customer_rate_limit_count_failed", {
				kind: args.kind,
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			release();
		}
	})());
}

type QuotaArgs = CustomerScope & {
	requestId: string;
	admissionId: string;
	kind: CustomerQuotaKind;
	internal?: boolean;
};

type QuotaCheck =
	| { decided: Response | null }
	| { bindings: GatewayBindings; scopeKey: string; admissionKey: string; now: number };

/** The local decisions shared by every quota kind; never waits on the counter. */
function checkLocally(args: QuotaArgs): QuotaCheck {
	if (args.internal) return { decided: null };
	const bindings = getBindingsIfConfigured();
	// Unit fixtures and local tools may run without Worker bindings.
	if (!bindings || bindings.CUSTOMER_RATE_LIMITS_ENABLED !== "true") return { decided: null };
	const now = Date.now();
	const scopeKey = customerScopeKey(args);
	const admissionKey = `${args.kind}|${scopeKey}|${args.admissionId}`;
	// A fallback attempt of a request that was already admitted and counted.
	// (Minute admissions happen once per HTTP request; see customer-quota.ts.)
	if ((admissions.get(admissionKey) ?? 0) > now) return { decided: null };
	const denial = activeDenial(`${args.kind}|${scopeKey}`, now);
	if (denial) return { decided: quotaExceeded(args, denial.limit, Math.max(1, Math.ceil((denial.until - now) / 1000))) };
	if (!bindings.CUSTOMER_RATE_LIMITS) {
		if (!missingBindingReported) console.error("customer_rate_limit_binding_missing");
		missingBindingReported = true;
		return { decided: null };
	}
	return { bindings, scopeKey, admissionKey, now };
}

/**
 * Admits immediately unless this isolate already knows the scope is over its
 * limit, in which case it returns the 429 response. Never waits on the counter.
 */
export function guardCustomerQuota(args: QuotaArgs): Response | null {
	const check = checkLocally(args);
	if (!("bindings" in check)) return check.decided;
	if (args.kind === "free-day") remember(admissions, check.admissionKey, check.now + ADMISSION_MEMORY_MS, MAX_ADMISSIONS);
	countInBackground(check.bindings, check.scopeKey, { ...args, limits: () => customerLimitsFor(check.bindings, args.workspaceId) });
	return null;
}

/**
 * Admits a free-model request. Uses local headroom when the counter recently
 * reported plenty left; otherwise awaits the counter so an exhausted scope is
 * rejected on its first request to each isolate. Fails open if the counter is
 * unavailable.
 */
async function guardFreeDayQuota(args: QuotaArgs): Promise<Response | null> {
	const check = checkLocally(args);
	if (!("bindings" in check)) return check.decided;
	const { bindings, scopeKey, admissionKey, now } = check;
	const known = freeDayHeadroom.get(scopeKey);
	if (known && known.until > now && known.remaining > FREE_DAY_HEADROOM_MARGIN) {
		known.remaining -= 1;
		remember(admissions, admissionKey, now + ADMISSION_MEMORY_MS, MAX_ADMISSIONS);
		countInBackground(bindings, scopeKey, { ...args, limits: () => customerLimitsFor(bindings, args.workspaceId) });
		return null;
	}
	const counted = await awaitShared((async () => {
		const limits = await customerLimitsFor(bindings, args.workspaceId);
		const stub = bindings.CUSTOMER_RATE_LIMITS!.getByName(scopeKey) as unknown as CustomerStub;
		return stub.admit(scopeKey, args.kind, args.admissionId, limits);
	})(), FREE_DAY_ADMIT_TIMEOUT_MS);
	if (!counted.settled) {
		console.warn("customer_rate_limit_count_failed", { kind: args.kind, error: "free_day_admit_unavailable" });
		remember(admissions, admissionKey, Date.now() + ADMISSION_MEMORY_MS, MAX_ADMISSIONS);
		return null;
	}
	noteAdmission(args.kind, scopeKey, counted.value);
	if (!counted.value.allowed) {
		return quotaExceeded(args, counted.value.limit, Math.max(1, counted.value.retryAfterSeconds));
	}
	remember(admissions, admissionKey, Date.now() + ADMISSION_MEMORY_MS, MAX_ADMISSIONS);
	return null;
}

export async function guardFreeRouteQuota(args: CustomerScope & {
	requestId: string;
	admissionId: string;
	pricingCard: PriceCard | null | undefined;
	internal?: boolean;
	testingMode?: boolean;
}): Promise<Response | null> {
	if (args.testingMode || !isFreePriceCard(args.pricingCard)) return null;
	return guardFreeDayQuota({ ...args, kind: "free-day" });
}

/** A workspace rate limit policy allowance (see core/rate-limit-policies.ts). */
export type PolicyQuotaScope = {
	scopeKey: string;
	requestsPerMinute: number | null;
	tokensPerMinute: number | null;
	concurrentRequests?: number | null;
	/** Await the request and token checks, and reject when the counter cannot answer. */
	strict?: boolean;
};
export type PolicyQuotaDenial = {
	scope: PolicyQuotaScope;
	/** "unavailable": a strict policy's counter did not answer in time. */
	kind: "requests" | "tokens" | "concurrent_requests" | "unavailable";
	limit: number;
	retryAfterSeconds: number;
};

/** How long admission waits for a counter that must answer first (concurrency, strict policies). */
const POLICY_AWAIT_TIMEOUT_MS = 2_000;
/** A concurrency slot whose release is lost (a crashed isolate, a dropped call) frees itself after this long. */
export const CONCURRENCY_LEASE_TTL_MS = 15 * 60_000;

/**
 * The concurrency slots one HTTP request holds, keyed by policy scope. The
 * entrypoint creates it, every attempt of the request (provider and model
 * fallbacks) acquires into it, and the entrypoint releases it once the
 * response has been delivered. Requests without one are not limited by
 * concurrency, because nothing would release their slots.
 */
export type ConcurrencyLeases = {
	held: Map<string, string>;
	released: boolean;
	/**
	 * Captured when a slot is taken and when the response is wrapped: the body
	 * can finish after the request's runtime has been cleared, when neither the
	 * bindings nor the request's waitUntil can be looked up any more.
	 */
	namespace?: GatewayBindings["CUSTOMER_RATE_LIMITS"];
	dispatch?: (promise: Promise<unknown>) => void;
};

export function createConcurrencyLeases(): ConcurrencyLeases {
	return { held: new Map(), released: false };
}

/**
 * Returns `response` with the request's concurrency slots released once it
 * has been delivered: when its body has been read to the end or cancelled by
 * the client, or straight away when it has no body. Responses of requests
 * that hold no slot are returned unchanged.
 */
export function releaseConcurrencyAfter(response: Response, leases: ConcurrencyLeases): Response {
	if (!leases.held.size || !response.body || response.status === 101) {
		releaseConcurrencyLeases(leases);
		return response;
	}
	// Still inside the request here; the body may finish after its runtime is cleared.
	leases.dispatch = captureBackgroundDispatcher();
	const reader = response.body.getReader();
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					releaseConcurrencyLeases(leases);
					controller.close();
				} else {
					controller.enqueue(value);
				}
			} catch (error) {
				releaseConcurrencyLeases(leases);
				controller.error(error);
			}
		},
		async cancel(reason) {
			releaseConcurrencyLeases(leases);
			await reader.cancel(reason);
		},
	});
	return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/** Releases every slot the request holds, in the background. Safe to call more than once. */
export function releaseConcurrencyLeases(leases: ConcurrencyLeases | null | undefined): void {
	if (!leases || leases.released) return;
	leases.released = true;
	if (!leases.held.size) return;
	const namespace = leases.namespace ?? getBindingsIfConfigured()?.CUSTOMER_RATE_LIMITS;
	const held = [...leases.held];
	leases.held.clear();
	if (!namespace) {
		console.warn("customer_rate_limit_release_failed", { error: "binding_unavailable" });
		return;
	}
	(leases.dispatch ?? dispatchBackground)(Promise.all(held.map(async ([scopeKey, leaseId]) => {
		try {
			await (namespace.getByName(scopeKey) as unknown as CustomerStub).releaseConcurrency(scopeKey, leaseId);
		} catch (error) {
			// The lease expires on its own after CONCURRENCY_LEASE_TTL_MS.
			console.warn("customer_rate_limit_release_failed", { error: error instanceof Error ? error.message : String(error) });
		}
	})));
}

/** Bindings that enforce rate limit policies, or null when enforcement is off or unavailable. */
export function policyQuotaBindings(): GatewayBindings | null {
	const bindings = getBindingsIfConfigured();
	if (!bindings || bindings.RATE_LIMIT_POLICIES_ENABLED !== "true") return null;
	if (!bindings.CUSTOMER_RATE_LIMITS) {
		if (!missingBindingReported) console.error("customer_rate_limit_binding_missing");
		missingBindingReported = true;
		return null;
	}
	return bindings;
}

export function policyQuotaReport(scopeKey: string, kind: "requests" | "tokens" = "requests"): PolicyQuotaReport | null {
	return (kind === "tokens" ? policyTokenReports : policyReports).get(scopeKey) ?? null;
}

function tokenReporter(scopeKey: string, admissionId: string) {
	return (admission: CustomerAdmission) => {
		noteAdmission("tokens", scopeKey, admission);
		remember(policyTokenReports, scopeKey, { ...admission, at: Date.now(), admissionId }, MAX_DENIALS);
	};
}

function tokensInBackground(bindings: GatewayBindings, scopeKey: string, call: (stub: CustomerStub) => Promise<CustomerAdmission>, onCounted: (admission: CustomerAdmission) => void): void {
	const release = ensureRuntimeForBackground();
	dispatchBackground((async () => {
		try {
			onCounted(await call(bindings.CUSTOMER_RATE_LIMITS!.getByName(scopeKey) as unknown as CustomerStub));
		} catch (error) {
			console.warn("customer_rate_limit_count_failed", { kind: "tokens", error: error instanceof Error ? error.message : String(error) });
		} finally {
			release();
		}
	})());
}

/** Asks a scope's counter and returns its answer, or null when it did not answer in time. */
async function askCounter(bindings: GatewayBindings, scopeKey: string, call: (stub: CustomerStub) => Promise<CustomerAdmission>): Promise<CustomerAdmission | null> {
	const answer = await awaitShared(call(bindings.CUSTOMER_RATE_LIMITS!.getByName(scopeKey) as unknown as CustomerStub), POLICY_AWAIT_TIMEOUT_MS);
	if (answer.settled) return answer.value;
	console.warn("customer_rate_limit_count_failed", { kind: "awaited", error: "policy_counter_unavailable" });
	return null;
}

function refused(scope: PolicyQuotaScope, kind: PolicyQuotaDenial["kind"], admission: CustomerAdmission | null): PolicyQuotaDenial {
	return admission
		? { scope, kind, limit: admission.limit, retryAfterSeconds: Math.max(1, admission.retryAfterSeconds) }
		: { scope, kind: "unavailable", limit: 0, retryAfterSeconds: 1 };
}

/**
 * The checks of one scope that must be answered before admitting: a strict
 * policy's request and token allowances, and a concurrency slot. Returns the
 * first refusal. A counter that does not answer refuses only a strict policy;
 * otherwise the request is admitted (fails open).
 */
async function awaitScope(bindings: GatewayBindings, scope: PolicyQuotaScope, admissionId: string, leases: ConcurrencyLeases | null): Promise<PolicyQuotaDenial | null> {
	const checks: Array<Promise<PolicyQuotaDenial | null>> = [];
	const requestsPerMinute = scope.requestsPerMinute;
	if (scope.strict && requestsPerMinute != null) {
		checks.push(askCounter(bindings, scope.scopeKey, (stub) => stub.admit(scope.scopeKey, "minute", admissionId, { requestsPerMinute })).then((admission) => {
			if (admission) {
				noteAdmission("minute", scope.scopeKey, admission);
				remember(policyReports, scope.scopeKey, { ...admission, at: Date.now(), admissionId }, MAX_DENIALS);
			}
			return admission?.allowed ? null : refused(scope, "requests", admission);
		}));
	}
	const tokensPerMinute = scope.tokensPerMinute;
	if (scope.strict && tokensPerMinute != null) {
		checks.push(askCounter(bindings, scope.scopeKey, (stub) => stub.peekTokens(scope.scopeKey, tokensPerMinute)).then((admission) => {
			if (admission) tokenReporter(scope.scopeKey, admissionId)(admission);
			return admission?.allowed ? null : refused(scope, "tokens", admission);
		}));
	}
	const concurrentRequests = scope.concurrentRequests;
	if (concurrentRequests != null && leases && !leases.released) {
		// Recorded before asking, so a slot granted after the wait gave up is still released.
		leases.held.set(scope.scopeKey, admissionId);
		leases.namespace ??= bindings.CUSTOMER_RATE_LIMITS;
		leases.dispatch ??= captureBackgroundDispatcher();
		checks.push(askCounter(bindings, scope.scopeKey, (stub) => stub.acquireConcurrency(scope.scopeKey, admissionId, concurrentRequests, CONCURRENCY_LEASE_TTL_MS)).then((admission) => {
			if (admission?.allowed) return null;
			// A full scope holds nothing for this request; an unanswered one may, so it stays recorded.
			if (admission) leases.held.delete(scope.scopeKey);
			return admission || scope.strict ? refused(scope, "concurrent_requests", admission) : null;
		}));
	}
	for (const denial of await Promise.all(checks)) if (denial) return denial;
	return null;
}

/**
 * Admits a request against every applicable policy allowance. Non-strict
 * request and token limits keep the non-blocking contract of the customer
 * minute quota: a scope this isolate knows is exhausted rejects locally;
 * otherwise request allowances are counted in the background and token
 * allowances asked how much is left, so this isolate learns of exhaustion
 * caused elsewhere. Strict limits and concurrency slots are awaited first
 * (see awaitScope); nothing is counted in the background unless every scope
 * admitted the request, and a refused request gives back the slots it took.
 * A strict request count already taken by one scope is not given back when
 * another scope refuses. Fallback attempts of an admitted request (same
 * admission ID) are neither recounted nor rejected.
 */
export async function admitPolicyQuotas(args: { scopes: PolicyQuotaScope[]; admissionId: string; leases?: ConcurrencyLeases | null }): Promise<PolicyQuotaDenial | null> {
	const bindings = policyQuotaBindings();
	if (!bindings) return null;
	const now = Date.now();
	const uncounted: PolicyQuotaScope[] = [];
	for (const scope of args.scopes) {
		if ((admissions.get(`policy|${scope.scopeKey}|${args.admissionId}`) ?? 0) > now) continue;
		for (const [kind, limited] of [["minute", scope.requestsPerMinute], ["tokens", scope.tokensPerMinute]] as const) {
			if (limited == null) continue;
			const denial = activeDenial(`${kind}|${scope.scopeKey}`, now);
			if (denial) return { scope, kind: kind === "minute" ? "requests" : "tokens", limit: denial.limit, retryAfterSeconds: Math.max(1, Math.ceil((denial.until - now) / 1000)) };
		}
		uncounted.push(scope);
	}
	const awaited = uncounted.filter((scope) => scope.strict || (scope.concurrentRequests != null && args.leases));
	if (awaited.length) {
		const leases = args.leases ?? null;
		const denials = await Promise.all(awaited.map((scope) => awaitScope(bindings, scope, args.admissionId, leases)));
		const denial = denials.find(Boolean);
		if (denial) {
			// A refused request ends here (other models share its allowances), so its slots are given back.
			releaseConcurrencyLeases(leases);
			return denial;
		}
	}
	for (const scope of uncounted) {
		remember(admissions, `policy|${scope.scopeKey}|${args.admissionId}`, now + ADMISSION_MEMORY_MS, MAX_ADMISSIONS);
		// A strict scope's request and token allowances were already asked above.
		if (scope.strict) continue;
		const requestsPerMinute = scope.requestsPerMinute;
		if (requestsPerMinute != null) {
			countInBackground(bindings, scope.scopeKey, {
				admissionId: args.admissionId,
				kind: "minute",
				limits: async () => ({ requestsPerMinute }),
				onCounted: (admission) => remember(policyReports, scope.scopeKey, { ...admission, at: Date.now(), admissionId: args.admissionId }, MAX_DENIALS),
			});
		}
		const tokensPerMinute = scope.tokensPerMinute;
		if (tokensPerMinute != null) {
			tokensInBackground(bindings, scope.scopeKey, (stub) => stub.peekTokens(scope.scopeKey, tokensPerMinute), tokenReporter(scope.scopeKey, args.admissionId));
		}
	}
	return null;
}

/**
 * Charges a completed attempt's token usage to each token allowance that
 * applied to its request, in the background. Callers charge each attempt once. A later request on this isolate is then
 * rejected locally once an allowance is exhausted.
 */
export function chargePolicyTokens(args: { scopes: PolicyQuotaScope[]; admissionId: string; tokens: number }): void {
	const bindings = policyQuotaBindings();
	if (!bindings || !Number.isSafeInteger(args.tokens) || args.tokens <= 0) return;
	for (const scope of args.scopes) {
		const tokensPerMinute = scope.tokensPerMinute;
		if (tokensPerMinute == null) continue;
		tokensInBackground(bindings, scope.scopeKey, (stub) => stub.chargeTokens(scope.scopeKey, args.tokens, tokensPerMinute), tokenReporter(scope.scopeKey, args.admissionId));
	}
}
