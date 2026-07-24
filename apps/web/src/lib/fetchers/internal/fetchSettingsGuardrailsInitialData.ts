import type { SettingsGuardrailsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchSettingsGuardrailsInitialData(): Promise<SettingsGuardrailsInitialData> {
	const context = await getServerAccountContext();
	const query = context.workspaceId ? `?workspaceId=${encodeURIComponent(context.workspaceId)}` : "";
	return fetchAccountWebApi<SettingsGuardrailsInitialData>(
		`/api/account/settings/guardrails${query}`,
		context.accessToken,
	);
}
