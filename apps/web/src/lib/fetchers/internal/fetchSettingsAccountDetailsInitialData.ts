import type { SettingsAccountDetailsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsAccountDetailsInitialData(): Promise<SettingsAccountDetailsInitialData> {
	const context = await getServerAccountContext();
	const query = context.obfuscateInfo == null
		? ""
		: `?obfuscateInfo=${context.obfuscateInfo ? "1" : "0"}`;
	return fetchAccountWebApi<SettingsAccountDetailsInitialData>(
		`/api/account/settings/account/details${query}`,
		context.accessToken,
	);
}
