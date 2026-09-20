import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { getPrivateUsageScope } from "@/lib/fetchers/internal/getPrivateUsageScope";
import { usageSearchParams, type UsageSearchParams } from "@/lib/query/privateUsage";
import type { UsageLogsViewKey } from "@/lib/gateway/usage/timeRange";
import UsageLogsClient from "./UsageLogsClient";

export const metadata: Metadata = { title: "Logs - Settings" };

export default async function Page({ searchParams }: { searchParams: Promise<UsageSearchParams> }) {
	const sp = await searchParams;
	const raw = (Array.isArray(sp.view) ? sp.view[0] : sp.view)?.toLowerCase();
	const segment = ["upstream", "jobs", "sessions"].includes(raw ?? "") ? raw : "requests";
	const params = usageSearchParams(sp);
	params.delete("view");
	redirect(`/settings/usage/logs/${segment}${params.size ? `?${params}` : ""}`);
}

export function UsageLogsRoutePage({ view, searchParams, jobKind }: {
	view: UsageLogsViewKey;
	searchParams: Promise<UsageSearchParams>;
	jobKind?: "video" | "batch";
}) {
	return <Suspense fallback={<SettingsSectionFallback />}><UsageLogsContent searchParams={searchParams} selectedView={view} forcedJobKind={jobKind} /></Suspense>;
}

export async function UsageLogsContent({ selectedRequestId = null, selectedView, forcedJobKind }: {
	searchParams: Promise<UsageSearchParams>;
	selectedRequestId?: string | null;
	selectedView?: UsageLogsViewKey;
	forcedJobKind?: "video" | "batch";
}) {
	const scope = await getPrivateUsageScope();
	return <UsageLogsClient key={`${scope.userId}:${scope.workspaceId}`} scope={scope} selectedRequestId={selectedRequestId} selectedView={selectedView} forcedJobKind={forcedJobKind} />;
}
