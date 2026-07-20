"use server";

import { revalidatePath } from "next/cache";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

export type KeyLimitPayload = {
	dailyRequests?: number | null; weeklyRequests?: number | null; monthlyRequests?: number | null;
	dailyCostNanos?: number | null; weeklyCostNanos?: number | null; monthlyCostNanos?: number | null;
	softBlocked?: boolean;
};

export type RotateApiKeyInput = { id: string; newName?: string; previousKeyExpiresAt?: string | null };

async function token() { const { accessToken } = await getServerAccountContext(); if (!accessToken) throw new Error("Unauthorized"); return accessToken; }
function refreshKeyPaths() { revalidatePath("/settings/keys"); }

export async function createApiKeyAction(name: string, creatorUserId: string, workspaceId: string, scopes = "[]", limits?: KeyLimitPayload) {
	if (!name || !creatorUserId || !workspaceId) throw new Error("Missing required key fields");
	const result = await fetchAccountWebApi<{ id?: string; plaintext: string; prefix: string }>("/api/account/settings/keys", await token(), { method: "POST", body: JSON.stringify({ name, creatorUserId, workspaceId, scopes, limits }) });
	refreshKeyPaths(); return result;
}

export async function updateApiKeyAction(id: string, updates: { name?: string; paused?: boolean }) {
	if (!id) throw new Error("Missing id");
	const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/keys/${encodeURIComponent(id)}`, await token(), { method: "PUT", body: JSON.stringify(updates) });
	refreshKeyPaths(); return result;
}

export async function rotateApiKeyAction(input: RotateApiKeyInput) {
	if (!input?.id) throw new Error("Missing id");
	const result = await fetchAccountWebApi<{ id?: string; plaintext: string; prefix: string; previousKeyExpiresAt: string | null }>(`/api/account/settings/keys/${encodeURIComponent(input.id)}/rotate`, await token(), { method: "POST", body: JSON.stringify(input) });
	refreshKeyPaths(); return result;
}

export async function deleteApiKeyAction(id: string, confirmName?: string) {
	if (!id) throw new Error("Missing id");
	const query = confirmName ? `?confirmName=${encodeURIComponent(confirmName)}` : "";
	const result = await fetchAccountWebApi<{ success: true; alreadyDeleted?: boolean }>(`/api/account/settings/keys/${encodeURIComponent(id)}${query}`, await token(), { method: "DELETE" });
	for (const path of ["/settings/keys", "/settings/guardrails", "/settings/broadcast", "/settings/usage", "/settings/usage/logs"]) revalidatePath(path);
	return result;
}

export async function updateKeyLimitsAction(id: string, payload: KeyLimitPayload) {
	if (!id) throw new Error("Missing id");
	const result = await fetchAccountWebApi<{ success: true }>(`/api/account/settings/keys/${encodeURIComponent(id)}/limits`, await token(), { method: "PUT", body: JSON.stringify(payload) });
	refreshKeyPaths(); return result;
}
