"use server";

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

type BroadcastRuleField = "model" | "provider" | "session_id" | "user_id" | "api_key_name" | "finish_reason" | "input" | "output" | "total_cost" | "total_tokens" | "prompt_tokens" | "completion_tokens";
type BroadcastRuleCondition = "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "exists" | "not_exists" | "matches_regex";

type CreateBroadcastDestinationInput = {
	destinationId: string;
	name: string;
	config: Record<string, string>;
	privacyExcludePromptsAndOutputs?: boolean;
	samplingRate?: number;
	groupJoin?: "and" | "or";
	keyIds?: string[];
	ruleGroups?: Array<{ match: "and" | "or"; rules: Array<{ field: BroadcastRuleField; condition: BroadcastRuleCondition; value?: string }> }>;
};

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	if (!workspaceId) throw new Error("Missing workspace id");
	return { accessToken, workspaceId };
}

function refresh(): void { revalidatePath("/settings/broadcast"); }

export async function createBroadcastDestinationAction(args: CreateBroadcastDestinationInput) {
	const context = await account();
	const result = await fetchAccountWebApi<{ ok: true; id: string }>("/api/account/settings/broadcast", context.accessToken, { method: "POST", body: JSON.stringify({ ...args, workspaceId: context.workspaceId }) });
	refresh();
	return result;
}

export async function disableBroadcastDestinationAction(id: string) {
	if (!id) throw new Error("Missing destination id");
	const context = await account();
	const result = await fetchAccountWebApi<{ ok: true }>(`/api/account/settings/broadcast/${encodeURIComponent(id)}/disable`, context.accessToken, { method: "PUT" });
	refresh();
	return result;
}

export async function deleteBroadcastDestinationAction(id: string) {
	if (!id) throw new Error("Missing destination id");
	const context = await account();
	const result = await fetchAccountWebApi<{ ok: true }>(`/api/account/settings/broadcast/${encodeURIComponent(id)}`, context.accessToken, { method: "DELETE" });
	refresh();
	return result;
}

export async function refreshBroadcastDestinationStatusAction(id: string) {
	if (!id) throw new Error("Missing destination id");
	const context = await account();
	return fetchAccountWebApi<{ ok: boolean; status: string }>(`/api/account/settings/broadcast/${encodeURIComponent(id)}/status`, context.accessToken, { method: "POST" });
}

export async function sendBroadcastSampleTraceAction(id: string) {
	if (!id) throw new Error("Missing destination id");
	const context = await account();
	return fetchAccountWebApi<{ ok: true; status: string; httpStatus: number }>(`/api/account/settings/broadcast/${encodeURIComponent(id)}/sample`, context.accessToken, { method: "POST" });
}

export async function testBroadcastConnectionFromConfigAction(args: { destinationId: string; config: Record<string, string> }) {
	const context = await account();
	return fetchAccountWebApi<{ ok: true; status: string; httpStatus: null; endpoint: string; headerCount: number }>("/api/account/settings/broadcast/test-config", context.accessToken, { method: "POST", body: JSON.stringify({ ...args, workspaceId: context.workspaceId }) });
}
