import type { SettingsKeySecurityInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsKeySecurityInitialData(): Promise<SettingsKeySecurityInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsKeySecurityInitialData>(
		`/api/account/settings/key-security${query}`,
		context.accessToken,
	);
}
