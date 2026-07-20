import type { SettingsUsageLogsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsUsageLogsInitialData(
	searchParams: Record<string, string | string[] | undefined> | undefined,
): Promise<SettingsUsageLogsInitialData> {
	const context = await getServerAccountContext();
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(searchParams ?? {})) {
		if (Array.isArray(value)) for (const item of value) params.append(key, item);
		else if (typeof value === "string") params.set(key, value);
	}
	if (context.workspaceId) params.set("workspaceId", context.workspaceId);
	return fetchAccountWebApi<SettingsUsageLogsInitialData>(
		`/api/account/settings/usage/logs?${params.toString()}`,
		context.accessToken,
	);
}
