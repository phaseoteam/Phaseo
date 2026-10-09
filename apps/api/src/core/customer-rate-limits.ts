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
import { dispatchBackground, ensureRuntimeForBackground, getBindingsIfConfigured } from "@/runtime/env";
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
	admit(scopeKey: string, kind: CustomerQuotaKind, admissionId: string, limits: CustomerLimits): Promise<CustomerAdmission>;
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
	missingBindingReported = false;
}

export function __customerQuotaStateSizeForTests(): { denials: number; admissions: number } {
	return { denials: denials.size, admissions: admissions.size };
}

/** Records what the counter reported for a scope: a denial to replay locally, or free-day headroom. */
function noteAdmission(kind: CustomerQuotaKind, scopeKey: string, admission: CustomerAdmission): void {
	if (!admission.allowed || (admission.remaining <= 0 && admission.retryAfterSeconds > 0)) {
		const until = Date.now() + Math.max(1, admission.retryAfterSeconds) * 1000;
		remember(denials, `${kind}|${scopeKey}`, { until, limit: admission.limit }, MAX_DENIALS);
	}
	if (kind === "free-day") {
		remember(freeDayHeadroom, scopeKey, { remaining: admission.remaining, until: Date.now() + FREE_DAY_HEADROOM_MS }, MAX_HEADROOM);
	}
}

function quotaExceeded(args: { requestId: string; kind: CustomerQuotaKind }, limit: number, retryAfterSeconds: number): Response {
	const response = err("key_limit_exceeded", {
		request_id: args.requestId,
		reason: args.kind === "minute" ? "customer_requests_per_minute" : "free_requests_per_day",
		description: args.kind === "minute"
			? `This user and workspace have reached their limit of ${limit} requests per minute. Retry after ${retryAfterSeconds} seconds.`
			: `This user and workspace have reached their daily allowance of ${limit} free-model requests, shared across all free models. The allowance resets at 00:00 UTC. Retry after ${retryAfterSeconds} seconds, choose a paid model, or ask your workspace administrator to request a higher limit.`,
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

function countInBackground(bindings: GatewayBindings, scopeKey: string, args: CustomerScope & {
	admissionId: string;
	kind: CustomerQuotaKind;
}): void {
	const namespace = bindings.CUSTOMER_RATE_LIMITS!;
	// The request may finish (and release its runtime) before counting does.
	const release = ensureRuntimeForBackground();
	dispatchBackground((async () => {
		try {
			const limits = await customerLimitsFor(bindings, args.workspaceId);
			const stub = namespace.getByName(scopeKey) as unknown as CustomerStub;
			noteAdmission(args.kind, scopeKey, await stub.admit(scopeKey, args.kind, args.admissionId, limits));
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
	countInBackground(check.bindings, check.scopeKey, args);
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
		countInBackground(bindings, scopeKey, args);
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
