// Signed-in account data for the Account settings pages (cookies + web API).
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

const loadAccountDangerInitialData = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchSettingsAccountDangerInitialData } = await import("@/lib/fetchers/internal/fetchSettingsAccountDangerInitialData");
	return fetchSettingsAccountDangerInitialData();
});

export const accountDangerInitialDataQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-account-danger"],
		queryFn: () => loadAccountDangerInitialData(),
	});

const loadAccountMfaInitialData = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchSettingsAccountMfaInitialData } = await import("@/lib/fetchers/internal/fetchSettingsAccountMfaInitialData");
	return fetchSettingsAccountMfaInitialData();
});

export const accountMfaInitialDataQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-account-mfa"],
		queryFn: () => loadAccountMfaInitialData(),
	});
