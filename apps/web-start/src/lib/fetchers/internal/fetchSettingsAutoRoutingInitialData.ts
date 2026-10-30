import type { SettingsAutoRoutingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsAutoRoutingInitialData(): Promise<SettingsAutoRoutingInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsAutoRoutingInitialData>(`/api/account/settings/routing/auto${query}`, context.accessToken);
}
