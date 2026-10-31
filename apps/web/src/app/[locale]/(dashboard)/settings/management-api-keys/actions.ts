import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import type { ManagementKeyTemplate } from "@/lib/managementKeyScopes";

export type ManagementKeyLimitPayload = {
	dailyRequests?: number | null;
	weeklyRequests?: number | null;
	monthlyRequests?: number | null;
	dailyCostNanos?: number | null;
	weeklyCostNanos?: number | null;
	monthlyCostNanos?: number | null;
	softBlocked?: boolean;
};

export type CreateManagementKeyInput = {
	name: string;
	creatorUserId: string;
	workspaceId: string;
	template?: "read-only" | "read-write" | "full-control";
	scopes?: string[];
	expiresAt?: string | null;
};

export type UpdateManagementKeyInput = {
	name?: string;
	paused?: boolean;
	expiresAt?: string | null;
};

export type { ManagementKeyTemplate } from "@/lib/managementKeyScopes";

async function accessToken(): Promise<string> {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	return accessToken;
}

function refreshManagementKeys(): void {
}

export const createManagementKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: CreateManagementKeyInput) => input)
	.handler(async ({ data: input }) => {
		if (!input.name?.trim() || !input.creatorUserId || !input.workspaceId) {
			throw new Error("Name, creator user ID, and workspace ID are required");
		}

		const result = await fetchAccountWebApi<{
			id?: string;
			plaintext: string;
			prefix: string;
			createdAt?: string;
		}>("/api/account/settings/management-keys", await accessToken(), {
			method: "POST",
			body: JSON.stringify(input),
		});
		refreshManagementKeys();
		return result;
	});

export const updateManagementKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; updates: UpdateManagementKeyInput }) => input)
	.handler(async ({ data: { id, updates } }) => {
		if (!id) throw new Error("Valid key ID is required");
		const result = await fetchAccountWebApi<{ success: true; message?: string }>(
			`/api/account/settings/management-keys/${encodeURIComponent(id)}`,
			await accessToken(),
			{ method: "PUT", body: JSON.stringify(updates) },
		);
		refreshManagementKeys();
		return result;
	});

export const updateManagementKeyScopesAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; template: ManagementKeyTemplate }) => input)
	.handler(async ({ data: { id, template } }) => {
		if (!id) throw new Error("Valid key ID is required");
		const result = await fetchAccountWebApi<{ success: true }>(
			`/api/account/settings/management-keys/${encodeURIComponent(id)}`,
			await accessToken(),
			{ method: "PUT", body: JSON.stringify({ template }) },
		);
		refreshManagementKeys();
		return result;
	});

export const updateManagementKeyLimitsAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; payload: ManagementKeyLimitPayload }) => input)
	.handler(async ({ data: { id, payload } }) => {
		if (!id) throw new Error("Valid key ID is required");
		const result = await fetchAccountWebApi<{ success: true }>(
			`/api/account/settings/management-keys/${encodeURIComponent(id)}`,
			await accessToken(),
			{ method: "PUT", body: JSON.stringify({ limits: payload }) },
		);
		refreshManagementKeys();
		return result;
	});

export const deleteManagementKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; confirmName?: string }) => input)
	.handler(async ({ data: { id, confirmName } }) => {
		if (!id) throw new Error("Valid key ID is required");
		const query = confirmName ? `?confirmName=${encodeURIComponent(confirmName)}` : "";
		const result = await fetchAccountWebApi<{ success: true }>(
			`/api/account/settings/management-keys/${encodeURIComponent(id)}${query}`,
			await accessToken(),
			{ method: "DELETE" },
		);
		refreshManagementKeys();
		return result;
	});

export const getManagementKeyById = createServerFn({ method: "POST", strict: { output: false } })
	.middleware([serverAction])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Valid key ID is required");
		const result = await fetchAccountWebApi<{ key: Record<string, unknown> }>(
			`/api/account/settings/management-keys/${encodeURIComponent(id)}`,
			await accessToken(),
		);
		return result.key;
	});

export const listManagementKeysByTeam = createServerFn({ method: "POST", strict: { output: false } })
	.middleware([serverAction])
	.validator((workspaceId: string) => workspaceId)
	.handler(async ({ data: workspaceId }) => {
		if (!workspaceId) throw new Error("Valid workspace ID is required");
		const result = await fetchAccountWebApi<{ keys: Record<string, unknown>[] }>(
			`/api/account/settings/management-keys?workspaceId=${encodeURIComponent(workspaceId)}`,
			await accessToken(),
		);
		return result.keys;
	});
