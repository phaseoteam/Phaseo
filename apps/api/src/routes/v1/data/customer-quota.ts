import type { MiddlewareHandler } from "hono";
import type { Env } from "@/runtime/types";
import { configureRuntime, clearRuntime } from "@/runtime/env";
import { prepareAuthentication } from "@pipeline/before/auth";
import { guardCustomerQuota } from "@core/customer-rate-limits";
import { generatePublicId } from "@pipeline/before/genId";
import { requestIdFor } from "@/runtime/request-id";

const admissions = new WeakMap<Request, Promise<Response | null>>();

async function admitRequest(req: Request): Promise<Response | null> {
	const auth = await prepareAuthentication(req);
	// Preserve each route's existing authentication error contract.
	if (!auth.ok) return null;
	const admissionId = generatePublicId();
	return guardCustomerQuota({
		workspaceId: auth.workspaceId,
		userId: auth.userId,
		internal: auth.internal,
		requestId: requestIdFor(req),
		admissionId,
		kind: "minute",
	});
}

export const customerQuotaMiddleware: MiddlewareHandler<Env> = async (c, next) => {
	if (c.req.method === "OPTIONS" || c.env.CUSTOMER_RATE_LIMITS_ENABLED !== "true") return next();
	configureRuntime(c.env);
	try {
		let admission = admissions.get(c.req.raw);
		if (!admission) {
			admission = admitRequest(c.req.raw);
			admissions.set(c.req.raw, admission);
		}
		const response = await admission;
		if (response) return response;
		await next();
	} finally {
		clearRuntime();
	}
};
