import type { SettingsRateLimitsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsRateLimitsInitialData(): Promise<SettingsRateLimitsInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsRateLimitsInitialData>(
		`/api/account/settings/rate-limits${query}`,
		context.accessToken,
	);
}
