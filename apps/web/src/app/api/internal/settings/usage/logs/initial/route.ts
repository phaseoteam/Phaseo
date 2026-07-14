import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
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
import {
	fetchAppNames,
	fetchPaginatedRequests,
	fetchRecentAsyncJobs,
	fetchAppMetadata,
	fetchModelMetadata,
	fetchProviderMetadata,
	fetchProviderNames,
	fetchSessionRollups,
} from "@/app/(dashboard)/gateway/usage/server-actions";

type ApiKeyOption = {
	id: string;
	name: string | null;
	prefix: string | null;
};

type LogsPayload = {
	appNameEntries: Array<[string, string]>;
	availableKeys: ApiKeyOption[];
	dedupedModels: string[];
	dedupedProviders: string[];
	initialRequestsPage: any;
	modelMetadataEntries: Array<[string, any]>;
	modelProviderEntries: Array<[string, string[]]>;
	providerMetadataEntries: Array<[string, any]>;
	providerNameEntries: Array<[string, string]>;
};

type JobsPayload = {
	appMetadataEntries: Array<[string, any]>;
	jobProviders: string[];
	modelMetadataEntries: Array<[string, any]>;
	providerNameEntries: Array<[string, string]>;
	recentJobs: any[];
};

type SessionsPayload = {
	appMetadataEntries: Array<[string, any]>;
	modelMetadataEntries: Array<[string, any]>;
	providerMetadataEntries: Array<[string, any]>;
	providerNameEntries: Array<[string, string]>;
	sessionAppIds: string[];
	sessionModelIds: string[];
	sessionProviderIds: string[];
	sessions: any[];
};

export type SettingsUsageLogsInitialData = {
	signedIn: boolean;
	workspaceId: string | null;
} & (
	| { view: "logs"; data: LogsPayload | null }
	| { view: "jobs"; data: JobsPayload | null }
	| { view: "sessions"; data: SessionsPayload | null }
);

function parseView(view?: string | null): UsageLogsViewKey {
	const v = (view ?? "").toLowerCase();
	return v === "logs" || v === "jobs" || v === "sessions" ? v : "logs";
}

function getParam(request: NextRequest, key: string): string | undefined {
	return request.nextUrl.searchParams.get(key) ?? undefined;
}

function parsePositivePage(value: string | undefined): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseSortDirection(value: string | undefined): "asc" | "desc" {
	return value === "asc" ? "asc" : "desc";
}

export async function GET(request: NextRequest) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	const view = parseView(getParam(request, "view"));

	if (!user) {
		return NextResponse.json({
			data: null,
			signedIn: false,
			view,
			workspaceId: null,
		} satisfies SettingsUsageLogsInitialData);
	}

	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) {
		return NextResponse.json({
			data: null,
			signedIn: true,
			view,
			workspaceId: null,
		} satisfies SettingsUsageLogsInitialData);
	}

	const rangeKeys = getUsageRangeParamKeys();
	const preset = parseUsageRangePreset(getParam(request, rangeKeys.preset));
	const customFrom = parseUsageDateInput(getParam(request, rangeKeys.from));
	const customTo = parseUsageDateInput(getParam(request, rangeKeys.to));
	const timeRange = resolveUsageTimeRange({
		preset,
		customFrom,
		customTo,
	});

	if (view === "jobs") {
		const jobKindFilter = getParam(request, "job_kind")?.trim() || null;
		const jobStatusFilter = getParam(request, "job_status")?.trim() || null;
		const jobProviderFilter = getParam(request, "job_provider")?.trim() || null;
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
		const jobAppIds = Array.from(
			new Set(
				recentJobs
					.map((job) => job.app_id)
					.filter(
						(appId): appId is string =>
							typeof appId === "string" && appId.trim().length > 0,
					),
			),
		);
		const [providerNames, modelMetadata, appMetadata] = await Promise.all([
			fetchProviderNames(jobProviders),
			fetchModelMetadata(jobModels),
			fetchAppMetadata(jobAppIds),
		]);

		return NextResponse.json({
			data: {
				appMetadataEntries: Array.from(appMetadata.entries()),
				jobProviders,
				modelMetadataEntries: Array.from(modelMetadata.entries()),
				providerNameEntries: Array.from(providerNames.entries()),
				recentJobs,
			},
			signedIn: true,
			view,
			workspaceId,
		} satisfies SettingsUsageLogsInitialData);
	}

	if (view === "sessions") {
		const sessionFilter = getParam(request, "session")?.trim() || null;
		const sessionAppFilter = getParam(request, "session_app")?.trim() || null;
		const sessionModelFilter = getParam(request, "session_model")?.trim() || null;
		const sessionProviderFilter =
			getParam(request, "session_provider")?.trim() || null;
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
			new Set(
				sessions.flatMap((session) => session.provider_ids ?? []).filter(Boolean),
			),
		);
		const [appMetadata, modelMetadata, providerNames, providerMetadata] =
			await Promise.all([
				fetchAppMetadata(sessionAppIds),
				fetchModelMetadata(sessionModelIds),
				fetchProviderNames(sessionProviderIds),
				fetchProviderMetadata(sessionProviderIds),
			]);

		return NextResponse.json({
			data: {
				appMetadataEntries: Array.from(appMetadata.entries()),
				modelMetadataEntries: Array.from(modelMetadata.entries()),
				providerMetadataEntries: Array.from(providerMetadata.entries()),
				providerNameEntries: Array.from(providerNames.entries()),
				sessionAppIds,
				sessionModelIds,
				sessionProviderIds,
				sessions,
			},
			signedIn: true,
			view,
			workspaceId,
		} satisfies SettingsUsageLogsInitialData);
	}

	const logModelFilter = getParam(request, "model")?.trim() || null;
	const logProviderFilter = getParam(request, "provider")?.trim() || null;
	const logKeyFilter = getParam(request, "key")?.trim() || null;
	const rawLogStatusFilter =
		getParam(request, "status")?.trim().toLowerCase() || null;
	const logStatusFilter =
		rawLogStatusFilter === "success" || rawLogStatusFilter === "error"
			? rawLogStatusFilter
			: "all";
	const logRequestFilter = getParam(request, "req")?.trim() || null;
	const sessionFilter = getParam(request, "session")?.trim() || null;
	const logsPage = parsePositivePage(getParam(request, "page"));
	const logsSortField = getParam(request, "sort")?.trim() || "created_at";
	const logsSortDir = parseSortDirection(getParam(request, "dir"));
	const [
		{ data: uniqueData },
		{ data: rollupData },
		{ data: keyRows },
		initialRequestsPage,
	] = await Promise.all([
		supabase
			.from("gateway_requests")
			.select("model_id, provider, app_id")
			.eq("workspace_id", workspaceId)
			.gte("created_at", timeRange.from)
			.lte("created_at", timeRange.to)
			.not("endpoint", "in", buildNotInFilter(LONG_RUNNING_REQUEST_ENDPOINTS)),
		supabase
			.from("gateway_usage_rollup_15m_workspace_provider_model")
			.select("canonical_model_id, provider")
			.eq("workspace_id", workspaceId)
			.gte("bucket_15m", timeRange.from)
			.lte("bucket_15m", timeRange.to),
		supabase
			.from("keys")
			.select("id,name,prefix")
			.eq("workspace_id", workspaceId)
			.neq("status", "deleted")
			.neq("name", CHAT_MANAGED_KEY_NAME)
			.order("created_at", { ascending: true }),
		fetchPaginatedRequests({
			timeRange,
			modelFilter: logModelFilter,
			providerFilter: logProviderFilter,
			keyFilter: logKeyFilter,
			statusFilter: logStatusFilter,
			requestFilter: logRequestFilter,
			sessionFilter,
			page: logsPage,
			sortField: logsSortField,
			sortDirection: logsSortDir,
		}),
	]);

	const uniqueModels = Array.from(
		new Set((uniqueData ?? []).map((r: any) => r.model_id).filter(Boolean)),
	);
	for (const row of rollupData ?? []) {
		if (
			typeof row?.canonical_model_id === "string" &&
			row.canonical_model_id.trim().length > 0
		) {
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
	const modelProviderEntries = Array.from(providerSetsByModel.entries()).map(
		([modelId, providers]) => [modelId, Array.from(providers)] as [string, string[]],
	);
	const [appNames, providerNames, providerMetadata, modelMetadata] =
		await Promise.all([
			fetchAppNames(uniqueAppIds),
			fetchProviderNames(dedupedProviders),
			fetchProviderMetadata(dedupedProviders),
			fetchModelMetadata(dedupedModels),
		]);
	const availableKeys = (keyRows ?? []).map((row: any) => ({
		id: row.id,
		name: row?.name ?? null,
		prefix: row?.prefix ?? null,
	}));

	return NextResponse.json({
		data: {
			appNameEntries: Array.from(appNames.entries()),
			availableKeys,
			dedupedModels,
			dedupedProviders,
			initialRequestsPage,
			modelMetadataEntries: Array.from(modelMetadata.entries()),
			modelProviderEntries,
			providerMetadataEntries: Array.from(providerMetadata.entries()),
			providerNameEntries: Array.from(providerNames.entries()),
		},
		signedIn: true,
		view,
		workspaceId,
	} satisfies SettingsUsageLogsInitialData);
}
