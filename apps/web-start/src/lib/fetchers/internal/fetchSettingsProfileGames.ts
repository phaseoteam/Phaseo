import type { SettingsProfileGamesData } from "@/lib/fetchers/profile/types";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

export async function fetchSettingsProfileGames(): Promise<SettingsProfileGamesData> {
	const context = await getServerAccountContext();
	try {
		return await fetchAccountWebApi<SettingsProfileGamesData>(
			"/api/account/settings/profile/games",
			context.accessToken,
		);
	} catch (error) {
		if (error instanceof WebApiError && (error.status === 404 || error.status === 503)) return { games: null };
		throw error;
	}
}
