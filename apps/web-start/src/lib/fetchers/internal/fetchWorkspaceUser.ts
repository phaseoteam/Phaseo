import { getServerAccountContext } from "./serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import type { ModelMetadataEntry } from "@/components/(gateway)/usage/model-display";

export type WorkspaceUserData = {
	modelMetadataEntries?: Array<[string, ModelMetadataEntry]>;
	profile: { id: string; name: string | null; avatarUrl: string | null };
	workspaceId: string;
	workspaceName: string;
	role: string | null;
	joinedAt: string | null;
	from: string;
	to: string;
	analytics: { requests: number; spendUsd: number; points: Array<{ date: string; requests: number; spendUsd: number }>; models: Array<{ modelId: string; requests: number; spendUsd: number }> } | null;
	keys: Array<{ id: string; workspace_id: string; name: string; prefix: string; status: string; created_at: string; last_used_at: string | null; expires_at: string | null }>;
	keyCount: number;
	keyPage: number;
	hasMoreKeys: boolean;
	logs: Array<{ request_id: string; created_at: string; model_id: string | null; success: boolean | null; cost_nanos: number | string | null }> | null;
};

export async function fetchWorkspaceUser(userId: string, workspaceId: string, keyPage?: string) {
	const { accessToken } = await getServerAccountContext();
	const params = new URLSearchParams({ workspaceId });
	if (keyPage) params.set("keyPage", keyPage);
	return fetchAccountWebApi<WorkspaceUserData>(`/api/account/settings/workspace-users/${encodeURIComponent(userId)}?${params}`, accessToken);
}
