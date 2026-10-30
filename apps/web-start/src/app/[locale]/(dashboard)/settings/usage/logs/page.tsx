import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { getPrivateUsageScope } from "@/lib/fetchers/internal/getPrivateUsageScope";
import { usageSearchParams, type UsageSearchParams } from "@/lib/query/privateUsage";
import type { UsageLogsViewKey } from "@/lib/gateway/usage/timeRange";
import UsageLogsClient from "./UsageLogsClient";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI");
	return { title: t("strings.Logs" as never) };
}

export default async function Page({ searchParams }: { searchParams: Promise<UsageSearchParams> }) {
	const sp = await searchParams;
	const raw = (Array.isArray(sp.view) ? sp.view[0] : sp.view)?.toLowerCase();
	const segment = ["upstream", "jobs", "sessions"].includes(raw ?? "") ? raw : "requests";
	const params = usageSearchParams(sp);
	params.delete("view");
	redirect({ href: `/settings/usage/logs/${segment}${params.size ? `?${params}` : ""}`, locale: await getLocale() });
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
