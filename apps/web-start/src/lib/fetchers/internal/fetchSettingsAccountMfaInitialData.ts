import type { SettingsAccountMfaInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsAccountMfaInitialData(): Promise<SettingsAccountMfaInitialData> {
	const { accessToken } = await getServerAccountContext();
	return fetchAccountWebApi<SettingsAccountMfaInitialData>(
		"/api/account/settings/account/mfa",
		accessToken,
	);
}
