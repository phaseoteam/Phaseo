"use server";

import { revalidatePath } from "next/cache";
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
		revalidatePath("/settings/rate-limits");
		return { ok: true as const, id: result.id };
	} catch (error) {
		return failure(error);
	}
}

export async function createRateLimitPolicy(payload: RateLimitPolicyPayload) {
	return send("/policies", "POST", payload);
}

export async function updateRateLimitPolicy(id: string, payload: RateLimitPolicyPayload) {
	return send(`/policies/${encodeURIComponent(id)}`, "PATCH", payload);
}

export async function deleteRateLimitPolicy(id: string) {
	return send(`/policies/${encodeURIComponent(id)}`, "DELETE");
}

export async function assignRateLimitPolicy(input: { policyId: string; targetType: SettingsRateLimitTargetType; targetId: string | null }) {
	return send("/assignments", "POST", {
		policy_id: input.policyId,
		target_type: input.targetType,
		...(input.targetType === "end_user_default" ? {} : { target_id: input.targetId }),
	});
}

export async function changeRateLimitAssignment(id: string, policyId: string) {
	return send(`/assignments/${encodeURIComponent(id)}`, "PATCH", { policy_id: policyId });
}

export async function removeRateLimitAssignment(id: string) {
	return send(`/assignments/${encodeURIComponent(id)}`, "DELETE");
}
