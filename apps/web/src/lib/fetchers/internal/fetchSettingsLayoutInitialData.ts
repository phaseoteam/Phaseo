import type { SettingsLayoutInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { resolveAccessibleWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export async function fetchSettingsLayoutInitialData(): Promise<SettingsLayoutInitialData> {
	const context = await getServerAccountContext();
	const workspaceId = context.workspaceId
		? await resolveAccessibleWorkspaceIdFromCookie({ throwOnFailure: true })
		: undefined;
	if (context.workspaceId && context.workspaceId !== workspaceId) {
		// eslint-disable-next-line no-console
		console.warn("[settings-layout] active workspace is no longer accessible", {
			fallback: workspaceId ? "accessible_workspace" : "account_level",
		});
	}
	const query = workspaceId
		? `?workspaceId=${encodeURIComponent(workspaceId)}`
		: "";
	return fetchAccountWebApi<SettingsLayoutInitialData>(
		`/api/account/settings/layout${query}`,
		context.accessToken,
	);
}
