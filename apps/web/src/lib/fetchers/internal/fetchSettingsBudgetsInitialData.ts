import type { SettingsBudgetsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsBudgetsInitialData(): Promise<SettingsBudgetsInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsBudgetsInitialData>(
		`/api/account/settings/budgets${query}`,
		context.accessToken,
	);
}
