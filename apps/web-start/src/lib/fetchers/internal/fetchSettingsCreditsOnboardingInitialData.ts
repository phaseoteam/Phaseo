import type { SettingsCreditsOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsCreditsOnboardingInitialData(): Promise<SettingsCreditsOnboardingInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsCreditsOnboardingInitialData>(
		`/api/account/settings/credits/onboarding${query}`,
		context.accessToken,
	);
}
