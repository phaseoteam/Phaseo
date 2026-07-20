import type { SettingsOAuthAppDetailInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsOAuthAppDetailInitialData(
	clientId: string,
): Promise<SettingsOAuthAppDetailInitialData> {
	const { accessToken } = await getServerAccountContext();
	return fetchAccountWebApi<SettingsOAuthAppDetailInitialData>(
		`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`,
		accessToken,
	);
}
