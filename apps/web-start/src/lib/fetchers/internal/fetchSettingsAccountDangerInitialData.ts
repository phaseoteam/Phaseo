import type { SettingsAccountDangerInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsAccountDangerInitialData(): Promise<SettingsAccountDangerInitialData> {
	const { accessToken } = await getServerAccountContext();
	return fetchAccountWebApi<SettingsAccountDangerInitialData>(
		"/api/account/settings/account/danger",
		accessToken,
	);
}
