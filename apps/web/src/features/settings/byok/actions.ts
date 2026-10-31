import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
import { canonicalByokProviderId } from "@/lib/byok/providerIds";
import { validateProviderKeyFormat } from "@/lib/byok/providerKeyValidation";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

async function context(): Promise<{ accessToken: string; workspaceId: string }> {
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	if (!workspaceId) throw new Error("No active workspace selected");
	return { accessToken, workspaceId };
}

export const createByokKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { name: string; providerId: string; value: string; enabled?: boolean; always_use?: boolean; allowedModelSlugs?: string[]; allowedApiKeyIds?: string[] }) => input)
	.handler(async ({ data: { name, providerId, value, enabled = true, always_use = false, allowedModelSlugs = [], allowedApiKeyIds = [] } }) => {
		if (!name || !providerId || !value) throw new Error("Missing BYOK key fields");
		const canonicalProviderId = canonicalByokProviderId(providerId);
		const format = validateProviderKeyFormat(canonicalProviderId, value);
		if (!format.ok) throw new Error(format.message);
		const account = await context();
		const result = await fetchAccountWebApi<{ id?: string; mode: "created" | "updated" }>(
			"/api/account/settings/byok",
			account.accessToken,
			{ method: "POST", body: JSON.stringify({ name, providerId: canonicalProviderId, value, enabled, always_use, allowedModelSlugs, allowedApiKeyIds, workspaceId: account.workspaceId }) },
		);
		return result;
	});

export const updateByokKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; updates: { name?: string; value?: string; enabled?: boolean; always_use?: boolean; allowedModelSlugs?: string[]; allowedApiKeyIds?: string[] } }) => input)
	.handler(async ({ data: { id, updates } }) => {
		if (!id) throw new Error("Missing id");
		const account = await context();
		const result = await fetchAccountWebApi<{ success: true }>(
			`/api/account/settings/byok/${encodeURIComponent(id)}`,
			account.accessToken,
			{ method: "PUT", body: JSON.stringify(updates) },
		);
		return result;
	});

export const deleteByokKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Missing id");
		const account = await context();
		const result = await fetchAccountWebApi<{ success: true }>(
			`/api/account/settings/byok/${encodeURIComponent(id)}`,
			account.accessToken,
			{ method: "DELETE" },
		);
		return result;
	});

export const updateByokFallbackAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((enabled: boolean) => enabled)
	.handler(async ({ data: enabled }) => {
		const account = await context();
		const result = await fetchAccountWebApi<{ success: true }>(
			"/api/account/settings/byok-fallback",
			account.accessToken,
			{ method: "PUT", body: JSON.stringify({ enabled, workspaceId: account.workspaceId }) },
		);
		return result;
	});

export const reorderByokKeyAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { id: string; direction: "up" | "down" }) => input)
	.handler(async ({ data: { id, direction } }) => {
		if (!id) throw new Error("Missing id");
		const account = await context();
		const result = await fetchAccountWebApi<{ success: true }>(
			`/api/account/settings/byok/${encodeURIComponent(id)}/reorder`,
			account.accessToken,
			{ method: "POST", body: JSON.stringify({ direction }) },
		);
		return result;
	});
