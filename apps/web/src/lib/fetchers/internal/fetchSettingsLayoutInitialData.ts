import type { SettingsLayoutInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsLayoutInitialData(): Promise<SettingsLayoutInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId
		? `?workspaceId=${encodeURIComponent(context.workspaceId)}`
		: "";
	return fetchAccountWebApi<SettingsLayoutInitialData>(
		`/api/account/settings/layout${query}`,
		context.accessToken,
	);
}
