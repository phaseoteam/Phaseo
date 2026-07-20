import type { SettingsCreditsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsCreditsInitialData(): Promise<SettingsCreditsInitialData> {
	const context = await getServerAccountContext();
	const params = new URLSearchParams();
	if (context.workspaceId) params.set("workspaceId", context.workspaceId);
	if (context.obfuscateInfo != null) params.set("obfuscateInfo", context.obfuscateInfo ? "1" : "0");
	return fetchAccountWebApi<SettingsCreditsInitialData>(
		`/api/account/settings/credits?${params.toString()}`,
		context.accessToken,
	);
}
