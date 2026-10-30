import type { SettingsPrivacyInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsPrivacyInitialData(): Promise<SettingsPrivacyInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId
		? `?workspaceId=${encodeURIComponent(context.workspaceId)}`
		: "";
	return fetchAccountWebApi<SettingsPrivacyInitialData>(
		`/api/account/settings/privacy${query}`,
		context.accessToken,
	);
}
