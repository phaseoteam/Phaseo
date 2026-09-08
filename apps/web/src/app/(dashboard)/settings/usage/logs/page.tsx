import type { Metadata } from "next";
import { Suspense } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { redirect } from "next/navigation";

import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AsyncJobsPanel from "@/components/(gateway)/usage/AsyncJobsPanel";
import SessionsPanel from "@/components/(gateway)/usage/SessionsPanel";
import UsageLogsToolbar from "@/components/(gateway)/usage/UsageLogsToolbar";
import UsageViewFilters from "@/components/(gateway)/usage/UsageViewFilters";
import RequestLabelFilter from "@/components/(gateway)/usage/RequestLabelFilter";
import InvestigateGeneration from "@/components/(gateway)/usage/UsageHeader/InvestigateGeneration";
import UpstreamRequestsTable from "@/components/(gateway)/usage/UpstreamRequestsTable";
import {
	getUsageRangeParamKeys,
	parseUsageDateInput,
	parseUsageRangePreset,
	resolveUsageTimeRange,
	type UsageLogsViewKey,
} from "@/lib/gateway/usage/timeRange";

import RequestsSection from "@/components/(gateway)/usage/RequestsSection";
import RouteRequestDetailDialog, {
	RouteRequestDetailErrorDialog,
} from "@/components/(gateway)/usage/RouteRequestDetailDialog";
import { investigateGeneration, type RequestRow } from "@/app/(dashboard)/gateway/usage/server-actions";
import { fetchSettingsUsageLogsInitialData } from "@/lib/fetchers/internal/fetchSettingsUsageLogsInitialData";

export const metadata: Metadata = {
	title: "Logs - Settings",
};

function parseView(view?: string | null): UsageLogsViewKey {
	const v = (view ?? "").toLowerCase();
	return v === "logs" || v === "upstream" || v === "jobs" || v === "sessions" ? v : "logs";
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
		? `/settings/usage/logs/requests/${encodeURIComponent(requestId)}`
		: "/settings/usage/logs/requests";
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

function formatLabelSpend(nanos: number): string {
	if (!Number.isFinite(nanos)) return "$0.00000";
	return `$${(nanos / 1e9).toFixed(5)}`;
}

export default async function Page(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const searchParams = await props.searchParams;
	const view = parseView(firstSearchParam(searchParams.view));
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(searchParams)) {
		if (key === "view") continue;
		if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
		else if (typeof value === "string") params.set(key, value);
	}
	const segment = view === "logs" ? "requests" : view;
	redirect(`/settings/usage/logs/${segment}${params.size ? `?${params.toString()}` : ""}`);
}

const SAMPLE_CLIENT_SOURCES = [
	{ id: "codex", name: "Codex", kind: "coding_agent", version: "0.145.0", detection: "declared" },
	{ id: "claude-code", name: "Claude Code", kind: "coding_agent", version: "2.1.218", detection: "declared" },
	{ id: "phaseo-typescript", name: "Phaseo TypeScript SDK", kind: "sdk", version: "2.2.0", detection: "declared" },
	{ id: "openai-python", name: "OpenAI Python SDK", kind: "sdk", version: "1.99.1", detection: "user_agent" },
	{ id: "curl", name: "cURL", kind: "http_client", version: "8.12.1", detection: "user_agent" },
	{ id: "api", name: "Direct HTTP", kind: "api", version: null, detection: "unknown" },
] as const;

function buildSampleSourceRows(rows: RequestRow[]): RequestRow[] {
	const base = rows[0] ?? ({
		request_id: "sample_base", created_at: new Date().toISOString(), endpoint: "responses",
		model_id: "openai/gpt-5.6-terra", provider: "openai", app_id: null, session_id: null,
		success: true, status_code: 200, error_code: null, error_message: null, error_payload: null,
		usage: { input_tokens: 128, output_tokens: 64, total_tokens: 192 }, cost_nanos: 1250000,
		pricing_lines: [], provider_attempts: [],
	} as RequestRow);

	return SAMPLE_CLIENT_SOURCES.map((source, index) => ({
		...base,
		request_id: `sample_source_${source.id}`,
		created_at: new Date(Date.now() - index * 70_000).toISOString(),
		is_sample: true,
		client_source_id: source.id,
		client_source_name: source.name,
		client_source_kind: source.kind,
		client_source_version: source.version,
		client_source_detection: source.detection,
		detail_metadata: { ...(base.detail_metadata ?? {}), client_source: source },
	}));
}

export function UsageLogsRoutePage({
	view,
	searchParams,
	jobKind,
}: {
	view: UsageLogsViewKey;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
	jobKind?: "video" | "batch";
}) {
	return <Suspense fallback={<SettingsSectionFallback />}><UsageLogsContent searchParams={searchParams} selectedView={view} forcedJobKind={jobKind} /></Suspense>;
}

export async function UsageLogsContent({
	searchParams,
	selectedRequestId = null,
	selectedView,
	forcedJobKind,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
	selectedRequestId?: string | null;
	selectedView?: UsageLogsViewKey;
	forcedJobKind?: "video" | "batch";
}) {
	const rawSearchParams = await searchParams;
	const sp: Record<string, string | string[] | undefined> = { ...rawSearchParams, ...(selectedView ? { view: selectedView } : {}), ...(forcedJobKind ? { job_kind: forcedJobKind } : {}) };
	const initialData = await fetchSettingsUsageLogsInitialData(sp);

	if (!initialData.signedIn || initialData.loadState === "unauthorized") redirect("/sign-in");

	if (initialData.loadState === "failed") {
		return (
			<Card>
				<CardHeader><CardTitle>Logs unavailable</CardTitle></CardHeader>
				<CardContent><p className="text-sm text-muted-foreground">We couldn&apos;t load request logs. Try again in a moment.</p></CardContent>
			</Card>
		);
	}

	if (initialData.loadState === "forbidden") {
		return (
			<Card>
				<CardHeader><CardTitle>Workspace access changed</CardTitle></CardHeader>
				<CardContent><p className="text-sm text-muted-foreground">You no longer have access to this workspace. Select another workspace to view its logs.</p></CardContent>
			</Card>
		);
	}

	if (!initialData.workspaceId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>No workspace available</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Join or create a workspace to view request logs.
					</p>
				</CardContent>
			</Card>
		);
	}

	const view = selectedView ?? parseView(
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
	const pageTitle = view === "logs" ? "Requests" : view === "upstream" ? "Upstream Requests" : view === "jobs" ? forcedJobKind === "video" ? "Videos" : forcedJobKind === "batch" ? "Batches" : "Jobs" : "Sessions";
	const pageDescription = view === "logs"
		? "Inspect gateway requests, routing decisions, usage, and errors."
		: view === "upstream"
			? "Inspect each provider attempt made while serving gateway requests."
			: view === "jobs"
				? forcedJobKind === "video" ? "Inspect asynchronous video generation jobs." : forcedJobKind === "batch" ? "Inspect asynchronous batch processing jobs." : "Inspect asynchronous video and batch jobs."
				: "Inspect grouped request activity across apps and models.";
	const timeRange = resolveUsageTimeRange({
		preset,
		customFrom,
		customTo,
	});

	let content: React.ReactNode;
	let filters: React.ReactNode = null;
	let detailDialog: React.ReactNode = null;

	if (view === "upstream") {
		const data = initialData.view === "upstream" ? initialData.data : null;
		const upstreamRows = data?.upstreamRequests ?? [];
		const modelFilter = firstSearchParam(sp.model)?.trim() || null;
		const providerFilter = firstSearchParam(sp.provider)?.trim() || null;
		const keyFilter = firstSearchParam(sp.key)?.trim() || null;
		const statusFilter = firstSearchParam(sp.status)?.trim() || "all";
		const filteredRows = upstreamRows.filter((row) =>
			(!modelFilter || row.model_id === modelFilter) &&
			(!providerFilter || row.provider === providerFilter) &&
			(!keyFilter || row.key_id === keyFilter) &&
			(statusFilter === "all" || (statusFilter === "success" ? row.success === true : row.success !== true)),
		);
		filters = <UsageViewFilters
			view="upstream"
			models={Array.from(new Set(upstreamRows.map((row) => row.model_id).filter(Boolean)))}
			providers={Array.from(new Set(upstreamRows.map((row) => row.provider).filter((value): value is string => Boolean(value))))}
			providerNames={new Map(data?.providerNameEntries ?? [])}
			apiKeys={data?.availableKeys ?? []}
			modelMetadata={new Map(data?.modelMetadataEntries ?? [])}
			providerMetadata={new Map(data?.providerMetadataEntries ?? [])}
		/>;
		content = (
			<UpstreamRequestsTable
				rows={filteredRows}
				modelMetadata={new Map(data?.modelMetadataEntries ?? [])}
				providerNames={new Map(data?.providerNameEntries ?? [])}
				providerMetadata={new Map(data?.providerMetadataEntries ?? [])}
				keys={new Map((data?.availableKeys ?? []).map((key) => [key.id, key]))}
			/>
		);
	} else if (view === "jobs") {
		const data = initialData.view === "jobs" ? initialData.data : null;
		if (!data) throw new Error("Missing usage jobs data");
		const providerNames = new Map(data.providerNameEntries);
		const modelMetadata = new Map(data.modelMetadataEntries);
		const appMetadata = new Map(data.appMetadataEntries);
		filters = (
			<UsageViewFilters
				view="jobs"
				lockJobKind={Boolean(forcedJobKind)}
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
				kindFilter={forcedJobKind ?? (
					jobKindFilter === "video" || jobKindFilter === "batch"
						? jobKindFilter
						: null
				)}
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
		const appMetadata = new Map(data.appNameEntries.map(([id, title]) => [id, { id, title, imageUrl: null }] as const));
		const providerNames = new Map(data.providerNameEntries);
		const providerMetadata = new Map(data.providerMetadataEntries);
		const modelMetadata = new Map(data.modelMetadataEntries);
		const modelProviders = new Map(data.modelProviderEntries);
		const showSampleSources = process.env.NODE_ENV !== "production" && firstSearchParam(sp.sampleSources) === "1";
		const sampleSourceFilter = firstSearchParam(sp.source)?.trim() || null;
		const sampleRows = showSampleSources
			? buildSampleSourceRows(data.initialRequestsPage.data).filter((row) => !sampleSourceFilter || row.client_source_id === sampleSourceFilter)
			: [];
		const requestRows = [...sampleRows, ...data.initialRequestsPage.data];
		const clientSources = showSampleSources
			? Array.from(new Map([...SAMPLE_CLIENT_SOURCES.map((source) => [source.id, { id: source.id, name: source.name }] as const), ...data.clientSources.map((source) => [source.id, source] as const)]).values())
			: data.clientSources;
		filters = (
			<>
				<UsageViewFilters
					view="logs"
					models={data.dedupedModels}
					providers={data.dedupedProviders}
					modelProviders={modelProviders}
					providerNames={providerNames}
					apiKeys={data.availableKeys}
					modelMetadata={modelMetadata}
					providerMetadata={providerMetadata}
					appMetadata={appMetadata}
					clientSources={clientSources}
					logAppIds={data.logAppIds}
					logEndpoints={data.logEndpoints}
					logFinishReasons={data.logFinishReasons}
					logErrorCodes={data.logErrorCodes}
					logStatusCodes={data.logStatusCodes}
				/>
				<RequestLabelFilter facets={data.labelFacets} />
			</>
		);

		content = (
			<>
				{data.labelSummary ? (
					<Card className="ring-1 ring-primary/15">
						<CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
							<div className="min-w-0">
								<p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Filtered spend</p>
								<p className="mt-1 truncate text-sm font-medium">
									<span className="font-mono">{data.labelSummary.key}</span>
									<span className="px-1.5 text-muted-foreground">=</span>
									<span>{data.labelSummary.value}</span>
								</p>
							</div>
							<div className="flex items-center gap-6 text-sm">
								<div>
									<p className="text-xs text-muted-foreground">Requests</p>
									<p className="mt-1 font-mono font-medium">{new Intl.NumberFormat("en-US").format(data.labelSummary.requestCount)}</p>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Spend</p>
									<p className="mt-1 font-mono font-medium">{formatLabelSpend(data.labelSummary.totalCostNanos)}</p>
								</div>
							</div>
							{data.labelSummary.isSampled ? <p className="basis-full text-xs text-muted-foreground">Spend is calculated from a 5,000-request sample.</p> : null}
						</CardContent>
					</Card>
				) : null}
				<RequestsSection
					timeRange={timeRange}
					appNames={appNames}
					providerNames={providerNames}
					providerMetadata={providerMetadata}
					modelMetadata={modelMetadata}
					initialPage={1}
					initialRows={requestRows}
					initialTotal={requestRows.length}
					initialTotalPages={data.initialRequestsPage.hasMore ? 2 : 1}
					initialHasMore={data.initialRequestsPage.hasMore}
					initialNextCursor={data.initialRequestsPage.nextCursor}
					initialPageSize={data.initialRequestsPage.pageSize ?? 50}
					detailBasePath="/settings/usage/logs/requests"
				/>
			</>
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
						position={currentIndex >= 0 ? currentIndex + 1 : null}
						total={rows.length}
					/>
				);
			} else {
				detailDialog = (
					<RouteRequestDetailErrorDialog
						closeHref={buildLogsRequestHref(sp)}
					/>
				);
			}
		}
	}
	return (
		<NuqsAdapter>
		<div className="min-w-0 space-y-6">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">{pageTitle}</h1>
					<p className="mt-1 max-w-3xl text-sm text-muted-foreground">
						{pageDescription}
					</p>
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
					{filters}
					{view === "logs" ? <InvestigateGeneration /> : null}
					<UsageLogsToolbar
						view={view}
						preset={preset}
						customFrom={customFrom}
						customTo={customTo}
					/>
				</div>
			</div>
			<div id="usage-log-active-filters" className="empty:hidden" />
			<div className="min-w-0 max-w-full space-y-4 overflow-hidden">
				{content}
			</div>
			{detailDialog}
		</div>
		</NuqsAdapter>
	);
}
