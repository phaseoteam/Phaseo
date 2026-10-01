"use server";

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

async function account() {
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) throw new Error("Unauthorized");
	return { token: context.accessToken, workspaceId: context.workspaceId };
}

function refresh() {
	revalidatePath("/settings/workspaces/private-models");
	revalidatePath("/models");
	revalidatePath("/models/table");
}

export async function createPrivateModelAction(input: Record<string, unknown>) {
	const value = await account();
	const result = await fetchAccountWebApi(`/api/account/private-models?workspaceId=${encodeURIComponent(value.workspaceId)}`, value.token, { method: "POST", body: JSON.stringify(input) });
	refresh(); return result;
}

export async function updatePrivateModelAction(id: string, input: Record<string, unknown>) {
	const value = await account();
	const result = await fetchAccountWebApi(`/api/account/private-models/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(value.workspaceId)}`, value.token, { method: "PATCH", body: JSON.stringify(input) });
	refresh(); return result;
}

export async function deletePrivateModelAction(id: string) {
	const value = await account();
	const result = await fetchAccountWebApi(`/api/account/private-models/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(value.workspaceId)}`, value.token, { method: "DELETE" });
	refresh(); return result;
}
