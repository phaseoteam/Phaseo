// Signed-in display preferences (cookies + web API).
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

const loadPreferencesInitialData = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchSettingsPreferencesInitialData } = await import("@/lib/fetchers/internal/fetchSettingsPreferencesInitialData");
	return fetchSettingsPreferencesInitialData();
});

export const preferencesInitialDataQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-preferences"],
		queryFn: () => loadPreferencesInitialData(),
	});
