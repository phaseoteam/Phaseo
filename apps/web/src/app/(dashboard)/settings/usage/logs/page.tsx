import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Briefcase, Clock3, FileText, ShieldAlert } from "lucide-react";

import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import AsyncJobsPanel from "@/components/(gateway)/usage/AsyncJobsPanel";
import SessionsPanel from "@/components/(gateway)/usage/SessionsPanel";
import UsageLogsToolbar from "@/components/(gateway)/usage/UsageLogsToolbar";
import UsageViewFilters from "@/components/(gateway)/usage/UsageViewFilters";
import {
	getUsageRangeParamKeys,
	parseUsageDateInput,
	parseUsageRangePreset,
	resolveUsageTimeRange,
	type UsageLogsViewKey,
} from "@/lib/gateway/usage/timeRange";

import RequestsSection from "@/components/(gateway)/usage/RequestsSection";
import RouteRequestDetailDialog from "@/components/(gateway)/usage/RouteRequestDetailDialog";
import { investigateGeneration } from "@/app/(dashboard)/gateway/usage/server-actions";
import { fetchSettingsUsageLogsInitialData } from "@/lib/fetchers/internal/fetchSettingsUsageLogsInitialData";

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

function buildLogsRequestHref(
	searchParams: Record<string, string | string[] | undefined>,
	requestId?: string | null,
): string {
	const next = new URLSearchParams();
	for (const [key, rawValue] of Object.entries(searchParams)) {
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
	const query = next.toString();
	const base = requestId
		? `/settings/usage/logs/${encodeURIComponent(requestId)}`
		: "/settings/usage/logs";
	return query ? `${base}?${query}` : base;
}

function firstSearchParam(
	value: string | string[] | undefined,
): string | undefined {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value[0];
	return undefined;
}

function parsePositivePage(value: string | undefined): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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

export async function UsageLogsContent({
	searchParams,
	selectedRequestId = null,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
	selectedRequestId?: string | null;
}) {
	const sp = await searchParams;
	const initialData = await fetchSettingsUsageLogsInitialData(sp);

	if (!initialData.signedIn) redirect("/sign-in");

	if (!initialData.workspaceId) {
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
	const logsPage = parsePositivePage(firstSearchParam(sp?.page));
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
	let detailDialog: React.ReactNode = null;

	if (view === "jobs") {
		const data = initialData.view === "jobs" ? initialData.data : null;
		if (!data) throw new Error("Missing usage jobs data");
		const providerNames = new Map(data.providerNameEntries);
		const modelMetadata = new Map(data.modelMetadataEntries);
		const appMetadata = new Map(data.appMetadataEntries);
		filters = (
			<UsageViewFilters
				view="jobs"
				providers={data.jobProviders}
				providerNames={providerNames}
			/>
		);
		content = (
			<AsyncJobsPanel
				initialJobs={data.recentJobs}
				title="Async jobs"
				description="Recent long-running video and batch jobs, including status, billing, and webhook delivery history."
				emptyMessage="No async jobs found in this workspace yet."
				refreshLimit={50}
				includeWithoutWebhook
				providerNames={providerNames}
				modelMetadata={modelMetadata}
				appMetadata={appMetadata}
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
		const data = initialData.view === "sessions" ? initialData.data : null;
		if (!data) throw new Error("Missing usage session data");
		const appMetadata = new Map(data.appMetadataEntries);
		const modelMetadata = new Map(data.modelMetadataEntries);
		const providerNames = new Map(data.providerNameEntries);
		const providerMetadata = new Map(data.providerMetadataEntries);
		filters = (
			<UsageViewFilters
				view="sessions"
				appMetadata={appMetadata}
				modelMetadata={modelMetadata}
				providerNames={providerNames}
				providerMetadata={providerMetadata}
				sessionAppIds={data.sessionAppIds}
				sessionModelIds={data.sessionModelIds}
				sessionProviderIds={data.sessionProviderIds}
			/>
		);

		content = (
			<SessionsPanel
				initialSessions={data.sessions}
				initialAppMetadata={appMetadata}
				initialModelMetadata={modelMetadata}
				initialProviderMetadata={providerMetadata}
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
		const data = initialData.view === "logs" ? initialData.data : null;
		if (!data) throw new Error("Missing usage logs data");
		const appNames = new Map(data.appNameEntries);
		const providerNames = new Map(data.providerNameEntries);
		const providerMetadata = new Map(data.providerMetadataEntries);
		const modelMetadata = new Map(data.modelMetadataEntries);
		const modelProviders = new Map(data.modelProviderEntries);
		filters = (
			<UsageViewFilters
				view="logs"
				models={data.dedupedModels}
				providers={data.dedupedProviders}
				modelProviders={modelProviders}
				providerNames={providerNames}
				apiKeys={data.availableKeys}
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
				initialPage={logsPage}
				initialRows={data.initialRequestsPage.data}
				initialTotal={data.initialRequestsPage.total}
				initialTotalPages={data.initialRequestsPage.totalPages}
				detailBasePath="/settings/usage/logs"
			/>
		);

		if (selectedRequestId) {
			const investigated = await investigateGeneration(selectedRequestId);
			if (investigated.success && investigated.data) {
				const rows: Array<{ request_id: string }> =
					data.initialRequestsPage.data;
				const currentIndex = rows.findIndex(
					(row) => row.request_id === selectedRequestId,
				);
				detailDialog = (
					<RouteRequestDetailDialog
						detail={investigated.data}
						closeHref={buildLogsRequestHref(sp)}
						previousHref={
							currentIndex > 0
								? buildLogsRequestHref(sp, rows[currentIndex - 1].request_id)
								: null
						}
						nextHref={
							currentIndex >= 0 && currentIndex < rows.length - 1
								? buildLogsRequestHref(sp, rows[currentIndex + 1].request_id)
								: null
						}
					/>
				);
			}
		}
	}
	return (
		<div className="space-y-6">
			<div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
				<div className="border-b border-border/70 bg-muted/20 px-5 py-5">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2">
									<FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
								</div>
								<Link
									href="/settings/usage"
									className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								>
									<BarChart3 className="h-3.5 w-3.5" />
									Observability
								</Link>
							</div>
							<div>
								<h1 className="text-2xl font-semibold tracking-tight">
									Usage Logs
								</h1>
								<p className="mt-1 max-w-3xl text-sm text-muted-foreground">
									Request-level inspection for gateway calls, async work, and sessions.
								</p>
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<Link
								href="/settings/usage?tab=guardrails"
								className="inline-flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
							>
								<ShieldAlert className="h-4 w-4" />
								Guardrails
							</Link>
							<UsageLogsToolbar
								view={view}
								preset={preset}
								customFrom={customFrom}
								customTo={customTo}
							/>
						</div>
					</div>
				</div>
				<div className="flex gap-1 overflow-x-auto p-2">
					{viewTabs.map((tab) => {
						const Icon = tab.icon;
						const isActive = tab.key === view;
						return (
							<Link
								key={tab.key}
								href={tab.href}
								prefetch={false}
								className={cn(
									"inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
			</div>
			<div className="space-y-4">
				{filters}
				{content}
			</div>
			{detailDialog}
		</div>
	);
}
