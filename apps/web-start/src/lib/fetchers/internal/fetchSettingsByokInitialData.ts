import { cacheLife, cacheTag } from "next/cache";
import type { SettingsByokInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsByokInitialData(): Promise<SettingsByokInitialData> {
	"use cache: private";
	cacheLife({ stale: 60, revalidate: 60, expire: 300 });
	cacheTag("settings-byok");
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsByokInitialData>(
		`/api/account/settings/byok${query}`,
		context.accessToken,
	);
}
