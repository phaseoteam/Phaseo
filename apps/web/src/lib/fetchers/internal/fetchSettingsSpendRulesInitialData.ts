import type { SettingsSpendRulesInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

/** The workspace's spend rules for Settings → Notifications; every member can read them. */
export async function fetchSettingsSpendRulesInitialData(): Promise<SettingsSpendRulesInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsSpendRulesInitialData>(
		`/api/account/settings/spend-rules${query}`,
		context.accessToken,
	);
}
