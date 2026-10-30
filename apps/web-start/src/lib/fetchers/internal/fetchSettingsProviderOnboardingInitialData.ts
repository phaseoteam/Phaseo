import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsProviderOnboardingInitialData(): Promise<SettingsProviderOnboardingInitialData> {
	const context = await getServerAccountContext();
	return fetchAccountWebApi<SettingsProviderOnboardingInitialData>(
		"/api/account/settings/provider-onboarding",
		context.accessToken,
	);
}
