import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { privateUsageScopeQuery } from "../usage.functions";
import { usageSearchParams, type UsageSearchParams } from "@/lib/query/privateUsage";
import type { UsageLogsViewKey } from "@/lib/gateway/usage/timeRange";
import UsageLogsClient from "./UsageLogsClient";
export { usageLogsRedirectHref } from "../usageRedirects";


export function UsageLogsRoutePage({ view, jobKind }: {
	view: UsageLogsViewKey;
	jobKind?: "video" | "batch";
}) {
	return <Suspense fallback={<SettingsSectionFallback />}><UsageLogsContent selectedView={view} forcedJobKind={jobKind} /></Suspense>;
}

export function UsageLogsContent({ selectedRequestId = null, selectedView, forcedJobKind }: {
	selectedRequestId?: string | null;
	selectedView?: UsageLogsViewKey;
	forcedJobKind?: "video" | "batch";
}) {
	const { data: scope } = useSuspenseQuery(privateUsageScopeQuery());
	return <UsageLogsClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} selectedRequestId={selectedRequestId} selectedView={selectedView} forcedJobKind={forcedJobKind} />;
}
