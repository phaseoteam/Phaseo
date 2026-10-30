import type { SettingsPresetsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export type { SettingsPresetsInitialData } from "@/lib/fetchers/internal/settingsTypes";

export async function fetchSettingsPresetsInitialData(): Promise<SettingsPresetsInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsPresetsInitialData>(
		`/api/account/settings/presets${query}`,
		context.accessToken,
	);
}
