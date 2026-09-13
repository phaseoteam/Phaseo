import type { SettingsUsageLogsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { resolveAccessibleWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";

type UsageLogsView = SettingsUsageLogsInitialData["view"];

function requestedView(
	searchParams: Record<string, string | string[] | undefined> | undefined,
): UsageLogsView {
	const raw = searchParams?.view;
	const value = Array.isArray(raw) ? raw[0] : raw;
	return value === "upstream" || value === "jobs" || value === "sessions"
		? value
		: "logs";
}

function emptyResult(
	view: UsageLogsView,
	loadState: Exclude<SettingsUsageLogsInitialData["loadState"], "ready" | undefined>,
	signedIn: boolean,
	workspaceId: string | null = null,
): SettingsUsageLogsInitialData {
	return { data: null, loadState, signedIn, view, workspaceId } as SettingsUsageLogsInitialData;
}

export async function fetchSettingsUsageLogsInitialData(
	searchParams: Record<string, string | string[] | undefined> | undefined,
): Promise<SettingsUsageLogsInitialData> {
	const context = await getServerAccountContext();
	const view = requestedView(searchParams);
	if (!context.accessToken) return emptyResult(view, "unauthorized", false);

	let workspaceId: string | undefined;
	try {
		workspaceId = await resolveAccessibleWorkspaceIdFromCookie({ throwOnFailure: true });
	} catch {
		return emptyResult(view, "failed", true);
	}
	if (!workspaceId) return emptyResult(view, "no_workspace", true);

	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(searchParams ?? {})) {
		if (Array.isArray(value)) for (const item of value) params.append(key, item);
		else if (typeof value === "string") params.set(key, value);
	}
	params.set("workspaceId", workspaceId);
	try {
		const data = await fetchAccountWebApi<SettingsUsageLogsInitialData>(
			`/api/account/settings/usage/logs?${params.toString()}`,
			context.accessToken,
		);
		if (data.data?.providerNameEntries) {
			data.data.providerNameEntries = data.data.providerNameEntries.map(([providerId, providerName]) => [providerId, resolveProviderDisplayName({ providerId, providerName })]);
		}
		return { ...data, loadState: "ready" };
	} catch (error) {
		if (error instanceof WebApiError && error.status === 401) {
			return emptyResult(view, "unauthorized", false);
		}
		if (error instanceof WebApiError && error.status === 403) {
			return emptyResult(view, "forbidden", true, workspaceId);
		}
		return emptyResult(view, "failed", true, workspaceId);
	}
}
