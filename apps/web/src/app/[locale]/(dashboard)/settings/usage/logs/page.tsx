import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { useSuspenseQuery } from "@tanstack/react-query";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { privateUsageScopeQuery } from "../usage.functions";
import { usageSearchParams, type UsageSearchParams } from "@/lib/query/privateUsage";
import type { UsageLogsViewKey } from "@/lib/gateway/usage/timeRange";
import UsageLogsClient from "./UsageLogsClient";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI");
	return { title: t("strings.Logs" as never) };
}

// The route's beforeLoad redirects to usageLogsRedirectHref(search), so this never renders.
export default function Page(_props: { searchParams: Promise<UsageSearchParams> }) {
	return null;
}

/** Where /settings/usage/logs redirects to (unlocalised; the route adds the locale). */
export function usageLogsRedirectHref(sp: UsageSearchParams): string {
	const raw = (Array.isArray(sp.view) ? sp.view[0] : sp.view)?.toLowerCase();
	const segment = ["upstream", "jobs", "sessions"].includes(raw ?? "") ? raw : "requests";
	const params = usageSearchParams(sp);
	params.delete("view");
	return `/settings/usage/logs/${segment}${params.size ? `?${params}` : ""}`;
}

export function UsageLogsRoutePage({ view, searchParams, jobKind }: {
	view: UsageLogsViewKey;
	searchParams: Promise<UsageSearchParams>;
	jobKind?: "video" | "batch";
}) {
	return <Suspense fallback={<SettingsSectionFallback />}><UsageLogsContent searchParams={searchParams} selectedView={view} forcedJobKind={jobKind} /></Suspense>;
}

export function UsageLogsContent({ selectedRequestId = null, selectedView, forcedJobKind }: {
	searchParams: Promise<UsageSearchParams>;
	selectedRequestId?: string | null;
	selectedView?: UsageLogsViewKey;
	forcedJobKind?: "video" | "batch";
}) {
	const { data: scope } = useSuspenseQuery(privateUsageScopeQuery());
	return <UsageLogsClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} selectedRequestId={selectedRequestId} selectedView={selectedView} forcedJobKind={forcedJobKind} />;
}
