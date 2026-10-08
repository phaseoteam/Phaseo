// Purpose: Customer request quotas (requests per minute, free-model requests per day).
// Why: Admission must never add latency to the request path.
// How: Requests are admitted immediately and counted exactly by the scope's
//      CustomerRateLimit Durable Object in the background. When the object
//      reports the scope exhausted, this isolate remembers the denial until the
//      window frees up and rejects later requests locally with the 429 contract.
//      A few requests already in flight at the boundary may exceed the limit.
import { dispatchBackground, ensureRuntimeForBackground, getBindingsIfConfigured } from "@/runtime/env";
import type { GatewayBindings } from "@/runtime/env.types";
import { err } from "@pipeline/before/http";
import type { PriceCard } from "@pipeline/pricing/types";
import { isFreePriceCard } from "@pipeline/pricing/free";

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
	missingBindingReported = false;
}

export function __customerQuotaStateSizeForTests(): { denials: number; admissions: number } {
	return { denials: denials.size, admissions: admissions.size };
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

async function customerLimitsFor(_bindings: GatewayBindings, _workspaceId: string): Promise<CustomerLimits> {
	return { ...DEFAULT_CUSTOMER_LIMITS };
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
			const admission = await stub.admit(scopeKey, args.kind, args.admissionId, limits);
			if (!admission.allowed || (admission.remaining <= 0 && admission.retryAfterSeconds > 0)) {
				const until = Date.now() + Math.max(1, admission.retryAfterSeconds) * 1000;
				remember(denials, `${args.kind}|${scopeKey}`, { until, limit: admission.limit }, MAX_DENIALS);
			}
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

/**
 * Admits immediately unless this isolate already knows the scope is over its
 * limit, in which case it returns the 429 response. Never waits on the counter.
 */
export function guardCustomerQuota(args: CustomerScope & {
	requestId: string;
	admissionId: string;
	kind: CustomerQuotaKind;
	internal?: boolean;
}): Response | null {
	if (args.internal) return null;
	const bindings = getBindingsIfConfigured();
	// Unit fixtures and local tools may run without Worker bindings.
	if (!bindings || bindings.CUSTOMER_RATE_LIMITS_ENABLED !== "true") return null;
	const now = Date.now();
	const scopeKey = customerScopeKey(args);
	const admissionKey = `${args.kind}|${scopeKey}|${args.admissionId}`;
	// A fallback attempt of a request that was already admitted and counted.
	// (Minute admissions happen once per HTTP request; see customer-quota.ts.)
	if ((admissions.get(admissionKey) ?? 0) > now) return null;
	const denial = activeDenial(`${args.kind}|${scopeKey}`, now);
	if (denial) return quotaExceeded(args, denial.limit, Math.max(1, Math.ceil((denial.until - now) / 1000)));
	if (!bindings.CUSTOMER_RATE_LIMITS) {
		if (!missingBindingReported) console.error("customer_rate_limit_binding_missing");
		missingBindingReported = true;
		return null;
	}
	if (args.kind === "free-day") remember(admissions, admissionKey, now + ADMISSION_MEMORY_MS, MAX_ADMISSIONS);
	countInBackground(bindings, scopeKey, args);
	return null;
}

export function guardFreeRouteQuota(args: CustomerScope & {
	requestId: string;
	admissionId: string;
	pricingCard: PriceCard | null | undefined;
	internal?: boolean;
	testingMode?: boolean;
}): Response | null {
	if (args.testingMode || !isFreePriceCard(args.pricingCard)) return null;
	return guardCustomerQuota({ ...args, kind: "free-day" });
}
