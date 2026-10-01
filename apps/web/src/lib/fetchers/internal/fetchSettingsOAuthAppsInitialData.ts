import type { SettingsOAuthAppsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { oauthAppDisplay } from "@/lib/oauth/settingsDisplay";

export async function fetchSettingsOAuthAppsInitialData(): Promise<SettingsOAuthAppsInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	const data = await fetchAccountWebApi<SettingsOAuthAppsInitialData>(
		`/api/account/settings/oauth-apps${query}`,
		context.accessToken,
	);
	return { initialTeamId: data.initialTeamId, signedIn: data.signedIn, oauthApps: data.oauthApps.map(oauthAppDisplay) };
}
