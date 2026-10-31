import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

type BroadcastRuleField = "model" | "provider" | "session_id" | "user_id" | "api_key_name" | "finish_reason" | "input" | "output" | "token_cost" | "total_cost" | "total_tokens" | "prompt_tokens" | "completion_tokens";
type BroadcastRuleCondition = "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "exists" | "not_exists" | "matches_regex";

type CreateBroadcastDestinationInput = {
	destinationId: string;
	name: string;
	config: Record<string, string>;
	privacyExcludePromptsAndOutputs?: boolean;
	samplingRate?: number;
	groupJoin?: "and" | "or";
	includeKeyIds?: string[];
	excludeKeyIds?: string[];
	includeGenerationMetadata?: boolean;
	includeCostMetadata?: boolean;
	includeIdentityMetadata?: boolean;
	includeRequestContext?: boolean;
	ruleGroups?: Array<{ match: "and" | "or"; rules: Array<{ field: BroadcastRuleField; condition: BroadcastRuleCondition; value?: string }> }>;
};

async function account(): Promise<{ accessToken: string; workspaceId: string }> {
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	if (!workspaceId) throw new Error("Missing workspace id");
	return { accessToken, workspaceId };
}

export const createBroadcastDestinationAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((args: CreateBroadcastDestinationInput) => args)
	.handler(async ({ data: args }) => {
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true; id: string }>("/api/account/settings/broadcast", context.accessToken, { method: "POST", body: JSON.stringify({ ...args, workspaceId: context.workspaceId }) });
		return result;
	});

export const disableBroadcastDestinationAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Missing destination id");
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true }>(`/api/account/settings/broadcast/${encodeURIComponent(id)}/disable`, context.accessToken, { method: "PUT" });
		return result;
	});

export const enableBroadcastDestinationAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Missing destination id");
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true }>(`/api/account/settings/broadcast/${encodeURIComponent(id)}/enable`, context.accessToken, { method: "PUT" });
		return result;
	});

export const deleteBroadcastDestinationAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Missing destination id");
		const context = await account();
		const result = await fetchAccountWebApi<{ ok: true }>(`/api/account/settings/broadcast/${encodeURIComponent(id)}`, context.accessToken, { method: "DELETE" });
		return result;
	});

export const refreshBroadcastDestinationStatusAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Missing destination id");
		const context = await account();
		return fetchAccountWebApi<{ ok: boolean; status: string }>(`/api/account/settings/broadcast/${encodeURIComponent(id)}/status`, context.accessToken, { method: "POST" });
	});

export const sendBroadcastSampleTraceAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		if (!id) throw new Error("Missing destination id");
		const context = await account();
		return fetchAccountWebApi<{ ok: true; status: string; httpStatus: number }>(`/api/account/settings/broadcast/${encodeURIComponent(id)}/sample`, context.accessToken, { method: "POST" });
	});

export const testBroadcastConnectionFromConfigAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((args: { destinationId: string; config: Record<string, string> }) => args)
	.handler(async ({ data: args }) => {
		try {
			const context = await account();
			return await fetchAccountWebApi<{ ok: true; status: string; httpStatus: number | null; endpoint: string; headerCount: number }>("/api/account/settings/broadcast/test-config", context.accessToken, { method: "POST", body: JSON.stringify({ ...args, workspaceId: context.workspaceId }) });
		} catch (error) {
			return {
				ok: false as const,
				status: error instanceof Error ? error.message : "Connection check failed",
			};
		}
	});
