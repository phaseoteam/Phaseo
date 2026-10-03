import { getServerAccountContext } from "./serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { fetchSettingsKeysInitialData } from "./fetchSettingsKeysInitialData";
import { matchesKeyRouteName } from "@/components/(gateway)/settings/keys/keyDetailHref";

export type KeyDetailData = {
	currentUserId?: string;
	observedAt: number;
	key: {
		id: string; workspace_id: string; name: string; prefix: string; status: string;
		created_by: string | null; created_at: string; last_used_at: string | null; expires_at: string | null;
		ip_allowlist: Array<{ label: string; address: string }>;
		daily_limit_requests: number; weekly_limit_requests: number; monthly_limit_requests: number;
		daily_limit_cost_nanos: number; weekly_limit_cost_nanos: number; monthly_limit_cost_nanos: number;
	};
	creatorName: string | null;
	creatorAvatarUrl: string | null;
	chart: { from: string; to: string; points: Array<{ date: string; requests: number; spendUsd: number }> } | null;
	workspaceName: string | null;
	canManage: boolean;
	usage: Record<string, number | string | null> | null;
};

export async function fetchSettingsKeyDetail(id: string) {
	const { accessToken } = await getServerAccountContext();
	return fetchAccountWebApi<KeyDetailData>(`/api/account/settings/keys/${encodeURIComponent(id)}`, accessToken);
}

export async function fetchSettingsKeyDetailByName(name: string, workspaceId?: string, prefix?: string) {
	const initial = await fetchSettingsKeysInitialData(workspaceId);
	if (!initial.currentUserId) throw new WebApiError("/api/account/settings/keys", 401);
	const keys = initial.teamsWithKeys.flatMap((workspace) => workspace.keys)
		.filter((key) => (prefix ? key.prefix === prefix : matchesKeyRouteName(key.name, name)) && (!workspaceId || key.workspace_id === workspaceId));
	if (!keys.length) throw new WebApiError("/api/account/settings/keys", 404);
	if (keys.length > 1) throw new WebApiError("/api/account/settings/keys", 409, "Multiple keys share this name. Open the key from the API keys table.");
	return fetchSettingsKeyDetail(String(keys[0].id));
}
