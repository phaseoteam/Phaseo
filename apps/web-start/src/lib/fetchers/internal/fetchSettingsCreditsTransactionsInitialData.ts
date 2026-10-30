import type { SettingsCreditsTransactionsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsCreditsTransactionsInitialData(): Promise<SettingsCreditsTransactionsInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsCreditsTransactionsInitialData>(
		`/api/account/settings/credits/transactions${query}`,
		context.accessToken,
	);
}
