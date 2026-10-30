import type { SettingsManagementApiKeysInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsManagementApiKeysInitialData(): Promise<SettingsManagementApiKeysInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsManagementApiKeysInitialData>(
		`/api/account/settings/management-api-keys${query}`,
		context.accessToken,
	);
}
