// The usage-alerts badge count for the signed-in workspace (cookies + web API).
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

/** null when signed out, without a workspace, or when the alerts could not be loaded. */
const loadUsageAlertsCount = createServerFn({ method: "GET" }).handler(async (): Promise<number | null> => {
	const { fetchSettingsUsageAlertsInitialData } = await import("@/lib/fetchers/internal/fetchSettingsUsageAlertsInitialData");
	try {
		const data = await fetchSettingsUsageAlertsInitialData();
		if (!data.signedIn || !data.workspaceId) return null;
		return data.warnings.filter((w) => w.countAsAlert).length;
	} catch {
		return null;
	}
});

export const usageAlertsCountQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-usage-alerts-count"],
		queryFn: () => loadUsageAlertsCount(),
	});
