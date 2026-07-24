"use server";

import { revalidatePath } from "next/cache";
import { batchApiFlag } from "@/lib/flags";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	if (!(await batchApiFlag())) throw new Error("Webhook settings are currently limited to the enabled Batch API segment");
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	if (!workspaceId) throw new Error("Missing workspace id");
	return { accessToken, workspaceId };
}
function refresh() { revalidatePath("/settings/webhooks"); }

export async function createWebhookEndpointAction(args: { name: string; url: string; events?: string[] }) {
	const context = await account();
	const result = await fetchAccountWebApi<{ ok: true; id: string; signingSecret: string }>("/api/account/settings/webhooks", context.accessToken, { method: "POST", body: JSON.stringify({ ...args, workspaceId: context.workspaceId }) });
	refresh(); return result;
}
export async function updateWebhookEndpointStatusAction(id: string, status: "active" | "disabled") {
	if (!id) throw new Error("Missing webhook endpoint id"); const context = await account();
	const result = await fetchAccountWebApi<{ ok: true }>(`/api/account/settings/webhooks/${encodeURIComponent(id)}/status`, context.accessToken, { method: "PUT", body: JSON.stringify({ status, workspaceId: context.workspaceId }) });
	refresh(); return result;
}
export async function rotateWebhookEndpointSecretAction(id: string) {
	if (!id) throw new Error("Missing webhook endpoint id"); const context = await account();
	const result = await fetchAccountWebApi<{ ok: true; signingSecret: string }>(`/api/account/settings/webhooks/${encodeURIComponent(id)}/rotate`, context.accessToken, { method: "POST", body: JSON.stringify({ workspaceId: context.workspaceId }) });
	refresh(); return result;
}
export async function deleteWebhookEndpointAction(id: string) {
	if (!id) throw new Error("Missing webhook endpoint id"); const context = await account();
	const result = await fetchAccountWebApi<{ ok: true }>(`/api/account/settings/webhooks/${encodeURIComponent(id)}`, context.accessToken, { method: "DELETE", body: JSON.stringify({ workspaceId: context.workspaceId }) });
	refresh(); return result;
}
