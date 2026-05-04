import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase, Clock3, FileText } from "lucide-react";

import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import AsyncJobsPanel from "@/components/(gateway)/usage/AsyncJobsPanel";
import SessionsPanel from "@/components/(gateway)/usage/SessionsPanel";
import UsageLogsToolbar from "@/components/(gateway)/usage/UsageLogsToolbar";
import UsageViewFilters from "@/components/(gateway)/usage/UsageViewFilters";
import {
	LONG_RUNNING_REQUEST_ENDPOINTS,
	buildNotInFilter,
} from "@/lib/gateway/usage/logFilters";
import {
	getUsageRangeParamKeys,
	parseUsageDateInput,
	parseUsageRangePreset,
	resolveUsageTimeRange,
	type UsageLogsViewKey,
} from "@/lib/gateway/usage/timeRange";

import RequestsSection from "@/components/(gateway)/usage/RequestsSection";
import {
	fetchAppNames,
	fetchRecentAsyncJobs,
	fetchAppMetadata,
	fetchModelMetadata,
	fetchProviderMetadata,
	fetchProviderNames,
	fetchSessionRollups,
} from "@/app/(dashboard)/gateway/usage/server-actions";

export const metadata: Metadata = {
	title: "Usage Logs - Settings",
};

function parseView(view?: string | null): UsageLogsViewKey {
	const v = (view ?? "").toLowerCase();
	return v === "logs" || v === "jobs" || v === "sessions" ? v : "logs";
}

function buildViewHref(
	view: UsageLogsViewKey,
	searchParams: Record<string, string | string[] | undefined>,
): string {
	const next = new URLSearchParams();
	for (const [key, rawValue] of Object.entries(searchParams)) {
		if (key === "view") continue;
		if (typeof rawValue === "string") {
			next.set(key, rawValue);
			continue;
		}
		if (Array.isArray(rawValue)) {
			for (const item of rawValue) {
				if (typeof item === "string") next.append(key, item);
			}
		}
	}
	next.set("view", view);
	return `/settings/usage/logs?${next.toString()}`;
}

function firstSearchParam(
	value: string | string[] | undefined,
): string | undefined {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value[0];
	return undefined;
}

export default function Page(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<Suspense fallback={<SettingsSectionFallback />}>
			<UsageLogsContent searchParams={props.searchParams} />
		</Suspense>
	);
}

async function UsageLogsContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) redirect("/sign-in");

	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Usage Logs</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						You need to be signed in and have a team selected to view logs.
					</p>
				</CardContent>
			</Card>
		);
	}

	const sp = await searchParams;
	const view = parseView(
		typeof sp?.view === "string"
			? sp?.view
			: Array.isArray(sp?.view)
				? sp?.view?.[0]
				: undefined,
	);
	const rangeKeys = getUsageRangeParamKeys();
	const preset = parseUsageRangePreset(firstSearchParam(sp?.[rangeKeys.preset]));
	const customFrom = parseUsageDateInput(firstSearchParam(sp?.[rangeKeys.from]));
	const customTo = parseUsageDateInput(firstSearchParam(sp?.[rangeKeys.to]));
	const sessionFilter = firstSearchParam(sp?.session)?.trim() || null;
	const jobKindFilter = firstSearchParam(sp?.job_kind)?.trim() || null;
	const jobStatusFilter = firstSearchParam(sp?.job_status)?.trim() || null;
	const jobProviderFilter = firstSearchParam(sp?.job_provider)?.trim() || null;
	const sessionAppFilter = firstSearchParam(sp?.session_app)?.trim() || null;
	const sessionModelFilter = firstSearchParam(sp?.session_model)?.trim() || null;
	const sessionProviderFilter = firstSearchParam(sp?.session_provider)?.trim() || null;
	const viewHref = {
		logs: buildViewHref("logs", sp),
		jobs: buildViewHref("jobs", sp),
		sessions: buildViewHref("sessions", sp),
	} as const;

	const viewTabs = [
		{ key: "logs" as const, label: "Logs", icon: FileText, href: viewHref.logs },
		{ key: "jobs" as const, label: "Jobs", icon: Briefcase, href: viewHref.jobs },
		{
			key: "sessions" as const,
			label: "Sessions",
			icon: Clock3,
			href: viewHref.sessions,
		},
	];

	const timeRange = resolveUsageTimeRange({
		preset,
		customFrom,
		customTo,
	});

	let content: React.ReactNode;
	let filters: React.ReactNode = null;

	if (view === "jobs") {
		const recentJobs = await fetchRecentAsyncJobs({
			limit: 50,
			includeWithoutWebhook: true,
			timeRange,
			kind:
				jobKindFilter === "video" || jobKindFilter === "batch"
					? jobKindFilter
					: null,
			status: jobStatusFilter,
			provider: jobProviderFilter,
		});
		const jobModels = Array.from(
			new Set(
				recentJobs
					.map((job) => job.model)
					.filter(
						(modelId): modelId is string =>
							typeof modelId === "string" && modelId.trim().length > 0,
					),
			),
		);
		const jobProviders = Array.from(
			new Set(
				recentJobs
					.map((job) => job.provider)
					.filter(
						(providerId): providerId is string =>
							typeof providerId === "string" && providerId.trim().length > 0,
					),
			),
		);
		const [providerNames, modelMetadata] = await Promise.all([
			fetchProviderNames(jobProviders),
			fetchModelMetadata(jobModels),
		]);
		filters = (
			<UsageViewFilters
				view="jobs"
				providers={jobProviders}
				providerNames={providerNames}
			/>
		);
		content = (
			<AsyncJobsPanel
				initialJobs={recentJobs}
				title="Async jobs"
				description="Recent long-running video and batch jobs, including status, billing, and webhook delivery history."
				emptyMessage="No async jobs found in this workspace yet."
				refreshLimit={50}
				includeWithoutWebhook
				providerNames={providerNames}
				modelMetadata={modelMetadata}
				variant="logs"
				timeRange={timeRange}
				showRefreshButton={false}
				kindFilter={
					jobKindFilter === "video" || jobKindFilter === "batch"
						? jobKindFilter
						: null
				}
				statusFilter={jobStatusFilter}
				providerFilter={jobProviderFilter}
			/>
		);
	} else if (view === "sessions") {
		const sessions = await fetchSessionRollups({
			timeRange,
			limit: 100,
			sessionId: sessionFilter,
			appId: sessionAppFilter,
			modelId: sessionModelFilter,
			provider: sessionProviderFilter,
		});
		const sessionAppIds = Array.from(
			new Set(sessions.flatMap((session) => session.app_ids ?? []).filter(Boolean)),
		);
		const sessionModelIds = Array.from(
			new Set(sessions.flatMap((session) => session.model_ids ?? []).filter(Boolean)),
		);
		const sessionProviderIds = Array.from(
			new Set(sessions.flatMap((session) => session.provider_ids ?? []).filter(Boolean)),
		);
		const [appMetadata, modelMetadata, providerNames] = await Promise.all([
			fetchAppMetadata(sessionAppIds),
			fetchModelMetadata(sessionModelIds),
			fetchProviderNames(sessionProviderIds),
		]);
		filters = (
			<UsageViewFilters
				view="sessions"
				appMetadata={appMetadata}
				modelMetadata={modelMetadata}
				providerNames={providerNames}
				sessionAppIds={sessionAppIds}
				sessionModelIds={sessionModelIds}
				sessionProviderIds={sessionProviderIds}
			/>
		);

		content = (
			<SessionsPanel
				initialSessions={sessions}
				initialAppMetadata={appMetadata}
				initialModelMetadata={modelMetadata}
				initialProviderNames={providerNames}
				timeRange={timeRange}
				showRefreshButton={false}
				appFilter={sessionAppFilter}
				modelFilter={sessionModelFilter}
				providerFilter={sessionProviderFilter}
				sessionFilter={sessionFilter}
			/>
		);
	} else {
		// Fetch unique models/providers/apps for table filters (best-effort)
		const { data: uniqueData } = await supabase
			.from("gateway_requests")
			.select("model_id, provider, app_id")
			.eq("workspace_id", workspaceId)
			.gte("created_at", timeRange.from)
			.lte("created_at", timeRange.to)
			.not("endpoint", "in", buildNotInFilter(LONG_RUNNING_REQUEST_ENDPOINTS));
		const { data: rollupData } = await supabase
			.from("gateway_usage_rollup_15m_workspace_provider_model")
			.select("canonical_model_id, provider")
			.eq("workspace_id", workspaceId)
			.gte("bucket_15m", timeRange.from)
			.lte("bucket_15m", timeRange.to);

		const uniqueModels = Array.from(
			new Set((uniqueData ?? []).map((r: any) => r.model_id).filter(Boolean)),
		);
		for (const row of rollupData ?? []) {
			if (typeof row?.canonical_model_id === "string" && row.canonical_model_id.trim().length > 0) {
				uniqueModels.push(row.canonical_model_id.trim());
			}
		}
		const dedupedModels = Array.from(new Set(uniqueModels));
		const uniqueProviders = Array.from(
			new Set((uniqueData ?? []).map((r: any) => r.provider).filter(Boolean)),
		);
		for (const row of rollupData ?? []) {
			if (typeof row?.provider === "string" && row.provider.trim().length > 0) {
				uniqueProviders.push(row.provider.trim());
			}
		}
		const dedupedProviders = Array.from(new Set(uniqueProviders));
		const uniqueAppIds = Array.from(
			new Set((uniqueData ?? []).map((r: any) => r.app_id).filter(Boolean)),
		);

		const modelProviders = (() => {
			const providerSetsByModel = new Map<string, Set<string>>();
			for (const row of uniqueData ?? []) {
				const modelId = typeof row?.model_id === "string" ? row.model_id : null;
				const providerId = typeof row?.provider === "string" ? row.provider : null;
				if (!modelId || !providerId) continue;
				if (!providerSetsByModel.has(modelId)) {
					providerSetsByModel.set(modelId, new Set<string>());
				}
				providerSetsByModel.get(modelId)!.add(providerId);
			}
			for (const row of rollupData ?? []) {
				const modelId =
					typeof row?.canonical_model_id === "string"
						? row.canonical_model_id.trim()
						: null;
				const providerId =
					typeof row?.provider === "string" ? row.provider.trim() : null;
				if (!modelId || !providerId) continue;
				if (!providerSetsByModel.has(modelId)) {
					providerSetsByModel.set(modelId, new Set<string>());
				}
				providerSetsByModel.get(modelId)!.add(providerId);
			}
			return new Map(
				Array.from(providerSetsByModel.entries()).map(([m, set]) => [
					m,
					Array.from(set),
				]),
			);
		})();

		const [appNames, providerNames, providerMetadata, modelMetadata] = await Promise.all([
			fetchAppNames(uniqueAppIds),
			fetchProviderNames(dedupedProviders),
			fetchProviderMetadata(dedupedProviders),
			fetchModelMetadata(dedupedModels),
		]);

		// Keys list for key label rendering inside the logs table.
		const { data: keyRows } = await supabase
			.from("keys")
			.select("id,name,prefix")
			.eq("workspace_id", workspaceId)
			.neq("status", "deleted")
			.neq("name", CHAT_MANAGED_KEY_NAME)
			.order("created_at", { ascending: true });
		const availableKeys = (keyRows ?? []).map((row: any) => ({
			id: row.id,
			name: row?.name ?? null,
			prefix: row?.prefix ?? null,
		}));
		filters = (
			<UsageViewFilters
				view="logs"
				models={dedupedModels}
				providers={dedupedProviders}
				modelProviders={modelProviders}
				providerNames={providerNames}
				apiKeys={availableKeys}
				modelMetadata={modelMetadata}
				providerMetadata={providerMetadata}
			/>
		);

		content = (
			<RequestsSection
				timeRange={timeRange}
				appNames={appNames}
				providerNames={providerNames}
				providerMetadata={providerMetadata}
				modelMetadata={modelMetadata}
			/>
		);
	}
	return (
		<div className="space-y-6">
			<div className="space-y-4">
				<div className="space-y-3">
					<h1 className="text-2xl font-semibold tracking-tight">Usage Logs</h1>
					<div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
						<div className="inline-flex w-fit self-start items-center gap-1 rounded-lg border border-border/70 p-1">
							{viewTabs.map((tab) => {
								const Icon = tab.icon;
								const isActive = tab.key === view;
								return (
									<Link
										key={tab.key}
										href={tab.href}
										prefetch={false}
										className={cn(
											"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
											isActive
												? "bg-primary text-primary-foreground"
												: "text-muted-foreground hover:bg-muted hover:text-foreground",
										)}
									>
										<Icon className="h-4 w-4" />
										{tab.label}
									</Link>
								);
							})}
						</div>
						<UsageLogsToolbar
							view={view}
							preset={preset}
							customFrom={customFrom}
							customTo={customTo}
							filters={filters}
						/>
					</div>
				</div>
				{content}
			</div>
		</div>
	);
}
