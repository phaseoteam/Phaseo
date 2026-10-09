import { getBindingsIfConfigured } from "@/runtime/env";
import { err } from "@pipeline/before/http";
import type { PriceCard } from "@pipeline/pricing/types";
import { isFreePriceCard } from "@pipeline/pricing/free";

export const DEFAULT_CUSTOMER_LIMITS = { requestsPerMinute: 25, freeRequestsPerDay: 1500 };
export type CustomerLimits = typeof DEFAULT_CUSTOMER_LIMITS;
export type CustomerScope = { workspaceId: string; userId?: string | null };
export type CustomerAdmission = {
	allowed: boolean;
	limit: number;
	remaining: number;
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
	admit(scopeKey: string, kind: "minute" | "free-day", admissionId: string): Promise<CustomerAdmission>;
};

export async function guardCustomerQuota(args: CustomerScope & {
	requestId: string;
	admissionId: string;
	kind: "minute" | "free-day";
	internal?: boolean;
}): Promise<Response | null> {
	if (args.internal) return null;
	const bindings = getBindingsIfConfigured();
	// Unit fixtures and local tools may run without Worker bindings.
	if (!bindings || bindings.CUSTOMER_RATE_LIMITS_ENABLED !== "true") return null;
	try {
		if (!bindings.CUSTOMER_RATE_LIMITS) throw new Error("customer_rate_limit_binding_missing");
		const scopeKey = customerScopeKey(args);
		const stub = bindings.CUSTOMER_RATE_LIMITS.getByName(scopeKey) as unknown as CustomerStub;
		const admission = await stub.admit(scopeKey, args.kind, args.admissionId);
		if (admission.allowed) return null;
		const response = err(args.kind === "free-day" ? "phaseo_free_model_limit_exceeded" : "key_limit_exceeded", {
			request_id: args.requestId,
			error_origin: args.kind === "free-day" ? "gateway" : "user",
			reason: args.kind === "minute" ? "customer_requests_per_minute" : "free_requests_per_day",
			description: args.kind === "minute"
				? `This user and workspace have reached their limit of ${admission.limit} requests per minute. Retry after ${admission.retryAfterSeconds} seconds.`
				: `Phaseo free-model daily limit reached. This user and workspace have reached their daily allowance of ${admission.limit} free-model requests, shared across all free models. The allowance resets at 00:00 UTC. Retry after ${admission.retryAfterSeconds} seconds, choose a paid model, or ask your workspace administrator to request a higher limit.`,
		});
		response.headers.set("Retry-After", String(admission.retryAfterSeconds));
		return response;
	} catch {
		// A broken counter or malformed administrator override must not allow unlimited traffic.
		const response = err("gateway_error", { request_id: args.requestId, reason: "customer_rate_limit_unavailable", status_code: 503 });
		response.headers.set("Retry-After", "5");
		return new Response(response.body, { status: 503, headers: response.headers });
	}
}

export async function guardFreeRouteQuota(args: CustomerScope & {
	requestId: string;
	admissionId: string;
	pricingCard: PriceCard | null | undefined;
	internal?: boolean;
	testingMode?: boolean;
}): Promise<Response | null> {
	if (args.testingMode || !isFreePriceCard(args.pricingCard)) return null;
	return guardCustomerQuota({ ...args, kind: "free-day" });
}
