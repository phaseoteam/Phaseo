import type { TeamsSettingsData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsTeamsInitialData(preferredWorkspaceId?: string | null): Promise<TeamsSettingsData> {
	const context = await getServerAccountContext();
	const params = new URLSearchParams();
	if (context.workspaceId) params.set("workspaceId", context.workspaceId);
	if (preferredWorkspaceId?.trim()) params.set("preferredWorkspaceId", preferredWorkspaceId.trim());
	const query = params.toString();
	return fetchAccountWebApi<TeamsSettingsData>(`/api/account/settings/teams${query ? `?${query}` : ""}`, context.accessToken);
}
