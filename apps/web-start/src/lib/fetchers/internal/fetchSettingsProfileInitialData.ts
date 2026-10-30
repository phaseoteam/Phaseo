import type { SettingsProfileInitialData } from "@/lib/fetchers/profile/types";
import { getServerAccountContext } from "./serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsProfileInitialData(): Promise<SettingsProfileInitialData> {
	const context = await getServerAccountContext();
	const query = context.obfuscateInfo == null ? "" : `?obfuscateInfo=${context.obfuscateInfo ? "1" : "0"}`;
	return fetchAccountWebApi<SettingsProfileInitialData>(`/api/account/settings/profile${query}`, context.accessToken);
}
