import type { SettingsDynamicRoutesInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";

export async function fetchSettingsDynamicRoutesInitialData(): Promise<SettingsDynamicRoutesInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	const data = await fetchAccountWebApi<SettingsDynamicRoutesInitialData>(`/api/account/settings/dynamic-routes${query}`, context.accessToken);
	return { ...data, providers: data.providers.map((provider) => ({ ...provider, name: resolveProviderDisplayName({ providerId: provider.id, providerName: provider.name }) })) };
}
