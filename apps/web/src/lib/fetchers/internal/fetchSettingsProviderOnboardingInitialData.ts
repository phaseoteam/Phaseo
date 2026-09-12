import type { SettingsProviderOnboardingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsProviderOnboardingInitialData(): Promise<SettingsProviderOnboardingInitialData> {
	const context = await getServerAccountContext();
	if (!context.workspaceId) throw new Error("Select a workspace to manage provider capabilities.");
	return fetchAccountWebApi<SettingsProviderOnboardingInitialData>(
		`/api/account/settings/provider-onboarding?workspaceId=${encodeURIComponent(context.workspaceId)}`,
		context.accessToken,
	);
}
