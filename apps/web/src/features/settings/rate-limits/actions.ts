import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import type { SettingsRateLimitTargetType } from "@/lib/fetchers/internal/settingsTypes";

/** Policy fields in API units, as built by draftToPayload. */
export type RateLimitPolicyPayload = {
	name: string;
	description: string | null;
	requests_per_minute: number | null;
	tokens_per_minute: number | null;
	concurrent_requests: number | null;
	fail_closed: boolean;
};
export type RateLimitActionError = { ok: false; status: number | null; message: string | null; code: string | null };

const BASE = "/api/account/settings/rate-limits";

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new WebApiError(BASE, 401);
	if (!workspaceId) throw new WebApiError(BASE, 400, "Select a workspace first");
	return { accessToken, workspaceId };
}

// Server action errors are masked in production, so failures are returned.
function failure(error: unknown): RateLimitActionError {
	if (error instanceof WebApiError) {
		const detail = error.detail ?? null;
		const code = detail && /^[a-z_]+$/.test(detail) ? detail : null;
		return { ok: false, status: error.status, message: code ? null : detail, code };
	}
	return { ok: false, status: null, message: null, code: null };
}

async function send(path: string, method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown> = {}) {
	try {
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true; id: string | null }>(`${BASE}${path}`, context.accessToken, {
			method,
			body: JSON.stringify({ ...body, workspaceId: context.workspaceId }),
		});
		return { ok: true as const, id: result.id };
	} catch (error) {
		return failure(error);
	}
}

export const createRateLimitPolicy = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((payload: RateLimitPolicyPayload) => payload)
	.handler(async ({ data: payload }) => {
		return send("/policies", "POST", payload);
	});

export const updateRateLimitPolicy = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; payload: RateLimitPolicyPayload }) => input)
	.handler(async ({ data: { id, payload } }) => {
		return send(`/policies/${encodeURIComponent(id)}`, "PATCH", payload);
	});

export const deleteRateLimitPolicy = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		return send(`/policies/${encodeURIComponent(id)}`, "DELETE");
	});

export const assignRateLimitPolicy = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { policyId: string; targetType: SettingsRateLimitTargetType; targetId: string | null }) => input)
	.handler(async ({ data: input }) => {
		return send("/assignments", "POST", {
			policy_id: input.policyId,
			target_type: input.targetType,
			...(input.targetType === "end_user_default" ? {} : { target_id: input.targetId }),
		});
	});

export const changeRateLimitAssignment = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; policyId: string }) => input)
	.handler(async ({ data: { id, policyId } }) => {
		return send(`/assignments/${encodeURIComponent(id)}`, "PATCH", { policy_id: policyId });
	});

export const removeRateLimitAssignment = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		return send(`/assignments/${encodeURIComponent(id)}`, "DELETE");
	});

/** Raises the workspace one trust-ladder tier; the gateway allows only the owner and checks eligibility. */
export const raiseRateLimitTier = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.handler(async () => {
		return send("/tier/raise", "POST");
	});
