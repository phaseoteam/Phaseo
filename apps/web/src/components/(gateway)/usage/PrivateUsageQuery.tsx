"use client";

import { useTranslations } from "next-intl";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { WebApiError } from "@/lib/web-api/client";
import { privateUsageOptions, type UsageSearchParams } from "@/lib/query/privateUsage";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { Button } from "@/components/ui/button";

export const PrivateUsageRefreshContext = createContext<{
	refresh: () => Promise<void>;
	refreshing: boolean;
	scope: AccountQueryScope;
	live: boolean;
	updatedAt: number;
} | null>(null);

export const usePrivateUsageRefresh = () => useContext(PrivateUsageRefreshContext);

export function usePrivateUsageQuery<T>(
	scope: AccountQueryScope,
	resource: string,
	params: UsageSearchParams,
	live: boolean,
	fetcher: (signal: AbortSignal) => Promise<T>,
	enabled = true,
) {
	return useQuery({
		...privateUsageOptions(scope, resource, params, live),
		enabled: enabled && Boolean(scope.userId && scope.workspaceId),
		queryFn: ({ signal }) => fetcher(signal),
	});
}

export function PrivateUsageQuery<T>({ query, scope, live = false, children }: {
	query: UseQueryResult<T, unknown>;
	scope: AccountQueryScope;
	live?: boolean;
	children: (data: T) => ReactNode;
}) {
	const t = useTranslations("SettingsUI");
	const refresh = async () => { await query.refetch({ throwOnError: true }); };
	if (!scope.workspaceId) return <p>{t("realtimeCopy.chooseWorkspace")}</p>;
	// Never leave an earlier successful payload visible after access is revoked.
	const denied = query.error instanceof WebApiError && [401, 403, 404].includes(query.error.status);
	if (denied || (!query.data && query.error)) {
		return (
			<div role="alert" className="space-y-3 rounded-xl border p-6">
				<p>{denied
					? t("realtimeCopy.accessChanged")
					: t("realtimeCopy.usageLoadFailed")}</p>
				<Button variant="outline" onClick={() => void query.refetch()}>{t("realtimeCopy.copyTryAgain")}</Button>
			</div>
		);
	}
	if (!query.data) return <SettingsSectionFallback />;
	return (
		<PrivateUsageRefreshContext value={{ refresh, refreshing: query.isFetching, scope, live, updatedAt: query.dataUpdatedAt }}>
			{query.error ? <p role="status" className="text-sm text-muted-foreground">{t("realtimeCopy.staleDataWarning")}</p> : null}
			{children(query.data)}
		</PrivateUsageRefreshContext>
	);
}
