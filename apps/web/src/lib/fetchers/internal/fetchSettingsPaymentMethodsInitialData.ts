import type { SettingsPaymentMethodsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsPaymentMethodsInitialData(): Promise<SettingsPaymentMethodsInitialData> {
	const context = await getServerAccountContext();
	const params = new URLSearchParams();
	if (context.workspaceId) params.set("workspaceId", context.workspaceId);
	if (context.obfuscateInfo != null) params.set("obfuscateInfo", context.obfuscateInfo ? "1" : "0");
	return fetchAccountWebApi<SettingsPaymentMethodsInitialData>(
		`/api/account/settings/payment-methods?${params.toString()}`,
		context.accessToken,
	);
}
