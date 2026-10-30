"use server";

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

async function account() {
	const context = await getServerAccountContext();
	if (!context.accessToken) throw new Error("Unauthorized");
	if (!context.workspaceId) throw new Error("Missing workspace id");
	return context as { accessToken: string; workspaceId: string };
}

function refresh() {
	revalidatePath("/settings/privacy");
}

export async function updateDataContributionConsent(enabled: boolean) {
	const context = await account();
	const result = await fetchAccountWebApi<{ ok: true; enabled: boolean }>("/api/account/settings/data-contribution", context.accessToken, {
		method: "PUT",
		body: JSON.stringify({ workspaceId: context.workspaceId, enabled }),
	});
	refresh();
	return result;
}

export async function createDataContributionClassifier(input: {
	name: string;
	instructions: string;
	categories: Record<string, string[]>;
	serviceTier: "standard" | "flex";
}) {
	const context = await account();
	const result = await fetchAccountWebApi<{ classifier: unknown }>("/api/account/settings/data-contribution/classifiers", context.accessToken, {
		method: "POST",
		body: JSON.stringify({ ...input, workspaceId: context.workspaceId }),
	});
	refresh();
	return result;
}

export async function setDataContributionClassifierEnabled(id: string, enabled: boolean) {
	const context = await account();
	const result = await fetchAccountWebApi<{ classifier: unknown }>(`/api/account/settings/data-contribution/classifiers/${encodeURIComponent(id)}`, context.accessToken, {
		method: "PUT",
		body: JSON.stringify({ workspaceId: context.workspaceId, enabled }),
	});
	refresh();
	return result;
}

export async function deleteDataContributionClassifier(id: string) {
	const context = await account();
	const result = await fetchAccountWebApi<{ ok: true }>(`/api/account/settings/data-contribution/classifiers/${encodeURIComponent(id)}`, context.accessToken, {
		method: "DELETE",
		body: JSON.stringify({ workspaceId: context.workspaceId }),
	});
	refresh();
	return result;
}
