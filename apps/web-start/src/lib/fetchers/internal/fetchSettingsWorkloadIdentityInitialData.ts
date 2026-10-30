import type { SettingsWorkloadIdentityInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsWorkloadIdentityInitialData(): Promise<SettingsWorkloadIdentityInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsWorkloadIdentityInitialData>(
		`/api/account/settings/trusted-workloads${query}`,
		context.accessToken,
	);
}
