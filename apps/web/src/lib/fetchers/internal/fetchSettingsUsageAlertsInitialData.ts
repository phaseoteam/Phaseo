import type { SettingsUsageAlertsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsUsageAlertsInitialData(): Promise<SettingsUsageAlertsInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsUsageAlertsInitialData>(`/api/account/settings/usage/alerts${query}`, context.accessToken);
}
