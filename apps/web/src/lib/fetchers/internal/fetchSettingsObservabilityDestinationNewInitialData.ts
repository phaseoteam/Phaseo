import type { SettingsObservabilityDestinationNewInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsObservabilityDestinationNewInitialData(
	provider: string,
): Promise<SettingsObservabilityDestinationNewInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsObservabilityDestinationNewInitialData>(
		`/api/account/settings/observability/destinations/new/${encodeURIComponent(provider)}${query}`,
		context.accessToken,
	);
}
