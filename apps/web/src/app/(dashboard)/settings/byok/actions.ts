"use server";

import { revalidatePath } from "next/cache";
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

function refresh(): void {
	revalidatePath("/settings/byok");
}

export async function createByokKeyAction(
	name: string,
	providerId: string,
	value: string,
	enabled = true,
	always_use = false,
) {
	if (!name || !providerId || !value) throw new Error("Missing BYOK key fields");
	const canonicalProviderId = canonicalByokProviderId(providerId);
	const format = validateProviderKeyFormat(canonicalProviderId, value);
	if (!format.ok) throw new Error(format.message);
	const account = await context();
	const result = await fetchAccountWebApi<{ id?: string; mode: "created" | "updated" }>(
		"/api/account/settings/byok",
		account.accessToken,
		{ method: "POST", body: JSON.stringify({ name, providerId: canonicalProviderId, value, enabled, always_use, workspaceId: account.workspaceId }) },
	);
	refresh();
	return result;
}

export async function updateByokKeyAction(
	id: string,
	updates: { name?: string; value?: string; enabled?: boolean; always_use?: boolean },
) {
	if (!id) throw new Error("Missing id");
	const account = await context();
	const result = await fetchAccountWebApi<{ success: true }>(
		`/api/account/settings/byok/${encodeURIComponent(id)}`,
		account.accessToken,
		{ method: "PUT", body: JSON.stringify(updates) },
	);
	refresh();
	return result;
}

export async function deleteByokKeyAction(id: string) {
	if (!id) throw new Error("Missing id");
	const account = await context();
	const result = await fetchAccountWebApi<{ success: true }>(
		`/api/account/settings/byok/${encodeURIComponent(id)}`,
		account.accessToken,
		{ method: "DELETE" },
	);
	refresh();
	return result;
}

export async function updateByokFallbackAction(enabled: boolean) {
	const account = await context();
	const result = await fetchAccountWebApi<{ success: true }>(
		"/api/account/settings/byok-fallback",
		account.accessToken,
		{ method: "PUT", body: JSON.stringify({ enabled, workspaceId: account.workspaceId }) },
	);
	refresh();
	return result;
}

export async function reorderByokKeyAction(id: string, direction: "up" | "down") {
	if (!id) throw new Error("Missing id");
	const account = await context();
	const result = await fetchAccountWebApi<{ success: true }>(
		`/api/account/settings/byok/${encodeURIComponent(id)}/reorder`,
		account.accessToken,
		{ method: "POST", body: JSON.stringify({ direction }) },
	);
	refresh();
	return result;
}
