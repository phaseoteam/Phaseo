import type { SettingsAuthorizedAppsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsAuthorizedAppsInitialData(): Promise<SettingsAuthorizedAppsInitialData> {
	const { accessToken } = await getServerAccountContext();
	return fetchAccountWebApi<SettingsAuthorizedAppsInitialData>(
		"/api/account/settings/authorized-apps",
		accessToken,
	);
}
