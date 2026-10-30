import type { SettingsClassifiersInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsClassifiersInitialData(): Promise<SettingsClassifiersInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsClassifiersInitialData>(
		`/api/account/settings/classifiers${query}`,
		context.accessToken,
	);
}
