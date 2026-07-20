import type { SettingsBetaInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsBetaInitialData(): Promise<SettingsBetaInitialData> {
	const context = await getServerAccountContext();
	return fetchAccountWebApi<SettingsBetaInitialData>(
		"/api/account/settings/beta",
		context.accessToken,
	);
}
