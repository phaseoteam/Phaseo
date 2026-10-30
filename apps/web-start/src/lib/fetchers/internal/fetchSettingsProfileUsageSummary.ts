import type { SettingsProfileUsageData } from "@/lib/fetchers/profile/types";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

export async function fetchSettingsProfileUsageSummary(): Promise<SettingsProfileUsageData> {
	const context = await getServerAccountContext();
	try {
		return await fetchAccountWebApi<SettingsProfileUsageData>(
			"/api/account/settings/profile/usage",
			context.accessToken,
		);
	} catch (error) {
		// Keep Profile usable while the independently deployed account API rolls out.
		if (error instanceof WebApiError && error.status === 404) return { usage: null };
		throw error;
	}
}
