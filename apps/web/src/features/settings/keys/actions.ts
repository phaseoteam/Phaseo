import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

export type KeyLimitPayload = {
	dailyRequests?: number | null; weeklyRequests?: number | null; monthlyRequests?: number | null;
	dailyCostNanos?: number | null; weeklyCostNanos?: number | null; monthlyCostNanos?: number | null;
	softBlocked?: boolean;
};

export type RotateApiKeyInput = { id: string; newName?: string; previousKeyExpiresAt?: string | null };

async function token() { const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized"); return accessToken; }

export const createApiKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { name: string; creatorUserId: string; workspaceId: string; scopes?: string; limits?: KeyLimitPayload; storageLocations?: string[] }) => input)
	.handler(async ({ data: { name, creatorUserId, workspaceId, scopes = "[]", limits, storageLocations = [] } }) => {
		if (!name || !creatorUserId || !workspaceId) throw new Error("Missing required key fields");
		const result = await fetchAccountWebApi<{ id?: string; plaintext: string; prefix: string }>("/api/account/settings/keys", await token(), { method: "POST", body: JSON.stringify({ name, creatorUserId, workspaceId, scopes, limits, storageLocations }) });
		return result;
	});

export const updateApiKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; updates: { limits?: KeyLimitPayload; name?: string; paused?: boolean; ipAllowlist?: Array<{ label: string; address: string }>; storageLocations?: string[] } }) => input)
	.handler(async ({ data: { id, updates } }) => {
		if (!id) throw new Error("Missing id");
		const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/keys/${encodeURIComponent(id)}`, await token(), { method: "PUT", body: JSON.stringify(updates) });
		return result;
	});

/** What a rotation copied from the old key to its replacement. */
export type KeyRotationCarried = { guardrails: number; destinations: number; dynamicRoutes: number; spendRules: number; department: boolean };

export const rotateApiKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: RotateApiKeyInput) => input)
	.handler(async ({ data: input }) => {
		if (!input?.id) throw new Error("Missing id");
		try {
			return await fetchAccountWebApi<{ id?: string; plaintext: string; prefix: string; previousKeyExpiresAt: string | null; carried?: KeyRotationCarried }>(`/api/account/settings/keys/${encodeURIComponent(input.id)}/rotate`, await token(), { method: "POST", body: JSON.stringify(input) });
		} catch (error) {
			// Server action errors are masked, so the one refusal the dialog explains is returned.
			if (error instanceof WebApiError && error.code === "spend_rule_limit_reached") return { error: "spend_rule_limit_reached" as const };
			throw error;
		}
	});

export const deleteApiKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; confirmName?: string }) => input)
	.handler(async ({ data: { id, confirmName } }) => {
		if (!id) throw new Error("Missing id");
		const query = confirmName ? `?confirmName=${encodeURIComponent(confirmName)}` : "";
		const result = await fetchAccountWebApi<{ success: true; alreadyDeleted?: boolean }>(`/api/account/settings/keys/${encodeURIComponent(id)}${query}`, await token(), { method: "DELETE" });
		return result;
	});

export const updateKeyLimitsAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; payload: KeyLimitPayload }) => input)
	.handler(async ({ data: { id, payload } }) => {
		if (!id) throw new Error("Missing id");
		const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/keys/${encodeURIComponent(id)}/limits`, await token(), { method: "PUT", body: JSON.stringify(payload) });
		return result;
	});

export const lookupApiKeyAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { workspaceId: string; key: string }) => input)
	.handler(async ({ data: { workspaceId, key } }) => {
		if (!workspaceId || !key) return { keyId: null };
		return fetchAccountWebApi<{ keyId: string | null }>("/api/account/settings/keys/lookup", await token(), {
			method: "POST",
			body: JSON.stringify({ workspaceId, key }),
		});
	});
