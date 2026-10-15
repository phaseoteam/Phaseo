import type { MiddlewareHandler } from "hono";
import type { Env } from "@/runtime/types";
import { configureRuntime, clearRuntime, getBindings } from "@/runtime/env";
import { prepareAuthentication } from "@pipeline/before/auth";
import { guardCustomerQuota, releaseCustomerQuota, type CustomerScope } from "@core/customer-rate-limits";
import { generatePublicId } from "@pipeline/before/genId";
import { requestIdFor } from "@/runtime/request-id";

const admissions = new WeakMap<Request, Promise<Response | null>>();
/** Requests admitted against the per-minute limit, so their slot can be returned. */
const admitted = new WeakMap<Request, CustomerScope & { admissionId: string; internal?: boolean }>();

/**
 * Authentication is prepared here and reused by the route. The quota check
 * itself never waits on the counter: it only consults this isolate's
 * remembered denials and counts the request in the background.
 */
async function admitRequest(req: Request): Promise<Response | null> {
	const auth = await prepareAuthentication(req);
	// Preserve each route's existing authentication error contract.
	if (!auth.ok) return null;
	const admissionId = generatePublicId();
	const denied = guardCustomerQuota({
		workspaceId: auth.workspaceId,
		userId: auth.userId,
		internal: auth.internal,
		requestId: requestIdFor(req),
		admissionId,
		kind: "minute",
	});
	if (!denied) admitted.set(req, { workspaceId: auth.workspaceId, userId: auth.userId, internal: auth.internal, admissionId });
	return denied;
}

/**
 * Returns the request's per-minute slot. Called when the response cache
 * answers the request, since cache hits do not count toward the limit.
 */
export function releaseCustomerRequest(req: Request): void {
	const admission = admitted.get(req);
	if (!admission) return;
	admitted.delete(req);
	releaseCustomerQuota(admission);
}

export function admitCustomerRequest(req: Request): Promise<Response | null> {
	if (getBindings().CUSTOMER_RATE_LIMITS_ENABLED !== "true") return Promise.resolve(null);
	let admission = admissions.get(req);
	if (!admission) {
		admission = admitRequest(req);
		admissions.set(req, admission);
	}
	return admission;
}

export const customerQuotaMiddleware: MiddlewareHandler<Env> = async (c, next) => {
	if (c.req.method === "OPTIONS" || c.env.CUSTOMER_RATE_LIMITS_ENABLED !== "true") return next();
	configureRuntime(c.env);
	try {
		const response = await admitCustomerRequest(c.req.raw);
		if (response) return response;
		await next();
	} finally {
		clearRuntime();
	}
};
