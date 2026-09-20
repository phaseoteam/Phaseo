import type { SettingsOAuthAppDetailInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { oauthAppDisplay, oauthAuthorizationDisplay } from "@/lib/oauth/settingsDisplay";

export async function fetchSettingsOAuthAppDetailInitialData(
	clientId: string,
): Promise<SettingsOAuthAppDetailInitialData> {
	const { accessToken } = await getServerAccountContext();
	const data = await fetchAccountWebApi<SettingsOAuthAppDetailInitialData>(
		`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`,
		accessToken,
	);
	return {
		signedIn: data.signedIn, currentUserId: data.currentUserId,
		oauthApp: data.oauthApp ? oauthAppDisplay(data.oauthApp) : null,
		authorizations: data.authorizations.map(oauthAuthorizationDisplay),
		recentRequests: data.recentRequests,
		usageStats: data.usageStats,
		userDirectory: data.userDirectory,
	};
}
