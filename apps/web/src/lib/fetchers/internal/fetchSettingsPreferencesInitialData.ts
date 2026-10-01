import type { SettingsPreferencesInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsPreferencesInitialData(): Promise<SettingsPreferencesInitialData> {
	const context = await getServerAccountContext();
	return fetchAccountWebApi<SettingsPreferencesInitialData>(
		"/api/account/settings/preferences",
		context.accessToken,
	);
}
