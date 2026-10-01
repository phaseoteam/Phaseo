import type { SettingsAuthorizedAppsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getLocalizedDocsHref } from "@/lib/docs";

export async function fetchSettingsAuthorizedAppsInitialData(locale: string): Promise<SettingsAuthorizedAppsInitialData> {
	const { accessToken } = await getServerAccountContext();
	const data = await fetchAccountWebApi<SettingsAuthorizedAppsInitialData>(
		"/api/account/settings/authorized-apps",
		accessToken,
	);
	const authorizedApps = await Promise.all(data.authorizedApps.map(async (app) => {
		if (app.app_name !== "OAuth application" || typeof app.authorization_id !== "string") return app;
		const detail = await fetchAccountWebApi<{ authorization: { client_id?: unknown } }>(
			`/api/account/settings/authorized-apps/${encodeURIComponent(app.authorization_id)}`,
			accessToken,
		).catch(() => null);
		const clientId = typeof detail?.authorization.client_id === "string"
			? detail.authorization.client_id
			: null;
		if (!clientId) return app;
		const isPhaseoCli = clientId === "phaseo_cli" || clientId === "aistats_cli";
		return {
			...app,
			app_client_id: clientId,
			app_name: isPhaseoCli ? "Phaseo CLI" : app.app_name,
			app_description: isPhaseoCli
				? "The official Phaseo command-line interface."
				: app.app_description,
			app_homepage_url: isPhaseoCli
				? getLocalizedDocsHref(locale, "/v1/developers/cli-and-mcp")
				: app.app_homepage_url,
			app_is_identified: isPhaseoCli,
		};
	}));
	return { ...data, authorizedApps };
}
