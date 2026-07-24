import type { SettingsOAuthAppsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsOAuthAppsInitialData(): Promise<SettingsOAuthAppsInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsOAuthAppsInitialData>(
		`/api/account/settings/oauth-apps${query}`,
		context.accessToken,
	);
}
