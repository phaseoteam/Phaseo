import type { SettingsBroadcastInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsBroadcastInitialData(): Promise<SettingsBroadcastInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId
		? `?workspaceId=${encodeURIComponent(context.workspaceId)}`
		: "";
	return fetchAccountWebApi<SettingsBroadcastInitialData>(
		`/api/account/settings/broadcast${query}`,
		context.accessToken,
	);
}
