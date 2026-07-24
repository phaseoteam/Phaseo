import type { SettingsKeysInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsKeysInitialData(
	workspaceId?: string,
): Promise<SettingsKeysInitialData> {
	const context = await getServerAccountContext();
	const requestedWorkspaceId = workspaceId?.trim() || context.workspaceId;
	const query = requestedWorkspaceId ? `?workspaceId=${encodeURIComponent(requestedWorkspaceId)}` : "";
	return fetchAccountWebApi<SettingsKeysInitialData>(
		`/api/account/settings/keys${query}`,
		context.accessToken,
	);
}
