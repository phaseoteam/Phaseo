"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useQueryState } from "nuqs";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	CheckCircle2,
	XCircle,
	Download,
	AppWindow,
} from "lucide-react";
import {
	fetchPaginatedRequests,
	fetchModelMetadata,
	PaginatedRequestsParams,
	type ProviderMetadataEntry,
	RequestRow,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { exportToCSV, exportToPDF } from "./export-utils";
import ExportDropdown from "./ExportDropdown";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { formatRelativeToNow } from "@/lib/formatRelative";
import UsageEntityHoverCard from "./UsageEntityHoverCard";
import {
	formatDateTime,
	formatWordyDateTime,
} from "@/lib/gateway/usage/timeFormatting";
import { formatErrorListSummary } from "@/lib/gateway/usage/errorListSummary";
import { registerUsageViewRefresher } from "@/lib/gateway/usage/refreshBus";
import {
	buildUsageDisplay,
	buildUsageFromNormalizedRequestFields,
	extractUsageMeters,
	formatUsageNumber,
} from "./usageMeters";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";
import {
	PROVIDER_PROMPT_TRAINING_POLICY_LABELS,
	normalizeProviderPromptTrainingPolicy,
} from "@/lib/providers/promptTrainingPolicy";

const RequestDetailDialog = dynamic(() => import("./RequestDetailDialog"));

interface UnifiedRequestsTableProps {
	timeRange: { from: string; to: string };
	appNames: Map<string, string>;
	modelMetadata: ModelMetadataMap;
	providerNames: Map<string, string>;
	providerMetadata: Map<string, ProviderMetadataEntry>;
	initialPage: number;
	initialRows: RequestRow[];
	initialTotal: number;
	initialTotalPages: number;
	detailBasePath?: string;
	onExportRef?: React.MutableRefObject<
		((format: "csv" | "pdf") => void) | null
	>;
}

function formatCost(nanos: number | null | undefined): string {
	const dollars = Number(nanos ?? 0) / 1e9;
	return `$${dollars.toFixed(5)}`;
}

function getModelDetailsHref(modelId: string | null): string | null {
	if (!modelId) return null;
	const [organisationId, ...modelParts] = modelId.split("/");
	if (!organisationId || modelParts.length === 0) return null;
	const routeModelId = modelParts.join("/");
	return `/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(routeModelId)}`;
}

function normalizeNonEmpty(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function getRequestedModelId(row: RequestRow): string | null {
	return normalizeNonEmpty(row.requested_model_id) ?? normalizeNonEmpty(row.model_id);
}

function getRoutedModelId(row: RequestRow): string | null {
	return normalizeNonEmpty(row.routed_model_id) ?? normalizeNonEmpty(row.model_id);
}

const PHASEO_CHAT_APP_KEYS = new Set([
	"phaseo-chat@phaseo.ai",
	"https://phaseo.app/chat",
	"phaseo-chat@phaseo.ai",
	"phaseo-chat@phaseo.ai",
	"https://phaseo.app/chat",
]);

function isPhaseoChatApp(row: RequestRow): boolean {
	const key = normalizeNonEmpty(row.app_key)?.toLowerCase();
	if (!key) return false;
	return PHASEO_CHAT_APP_KEYS.has(key);
}

function stopRowClick(event: React.MouseEvent<HTMLElement>) {
	event.stopPropagation();
}

export default function UnifiedRequestsTable({
	timeRange,
	appNames,
	modelMetadata,
	providerNames,
	providerMetadata,
	initialPage,
	initialRows,
	initialTotal,
	initialTotalPages,
	detailBasePath,
	onExportRef,
}: UnifiedRequestsTableProps) {
	const router = useRouter();
	const pathname = usePathname() ?? "";
	const searchParams = useSearchParams();
	const userTimeZone =
		typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			: "UTC";
	// URL state for pagination and sorting
	const [page, setPage] = useQueryState("page", {
		defaultValue: 1,
		parse: (value) => Math.max(1, parseInt(value || "1", 10)),
		serialize: (value) => String(value),
	});

	const [sortField, setSortField] = useQueryState("sort", {
		defaultValue: "created_at",
	});

	const [sortDir, setSortDir] = useQueryState("dir", {
		defaultValue: "desc",
	});

	const [relativeNowMs, setRelativeNowMs] = useState<number | null>(null);

	useEffect(() => {
		const updateNow = () => setRelativeNowMs(Date.now());
		updateNow();
		const interval = setInterval(updateNow, 60_000);
		return () => clearInterval(interval);
	}, []);

	// Filters from URL
	const [modelFilter] = useQueryState("model");
	const [providerFilter] = useQueryState("provider");
	const [appFilter] = useQueryState("app");
	const [endpointFilter] = useQueryState("endpoint");
	const [finishReasonFilter] = useQueryState("finish_reason");
	const [streamFilter] = useQueryState("stream");
	const [errorCodeFilter] = useQueryState("error_code");
	const [statusCodeFilter] = useQueryState("http_status");
	const [keyFilter] = useQueryState("key");
	const [statusFilter] = useQueryState("status");
	const [requestFilter] = useQueryState("req");
	const [sessionFilter] = useQueryState("session");

	// Local state
	const [pageCache, setPageCache] = useState<Map<number, RequestRow[]>>(
		() => new Map([[initialPage, initialRows]]),
	);
	const [total, setTotal] = useState(initialTotal);
	const [totalPages, setTotalPages] = useState(initialTotalPages);
	const [loading, setLoading] = useState(false);
	const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
	const [selectedRequest, setSelectedRequest] = useState<RequestRow | null>(null);
	const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
	const [resolvedModelMetadata, setResolvedModelMetadata] =
		useState<ModelMetadataMap>(new Map(modelMetadata));
	const [resolvedProviderNames, setResolvedProviderNames] = useState<
		Map<string, string>
	>(new Map(providerNames));
	const [resolvedProviderMetadata, setResolvedProviderMetadata] = useState<
		Map<string, ProviderMetadataEntry>
	>(new Map(providerMetadata));
	const [dialogOpen, setDialogOpen] = useState(false);
	const prefetchRequestDetail = useCallback(
		(requestId: string | null | undefined) => {
			if (!detailBasePath || !requestId) return;
			const query = searchParams?.toString();
			const href = `${detailBasePath}/${encodeURIComponent(requestId)}${query ? `?${query}` : ""}`;
			router.prefetch(href);
		},
		[detailBasePath, router, searchParams],
	);

	// Build cache key from filters
	const getCacheKey = useCallback(() => {
		return `${timeRange.from}-${timeRange.to}-${modelFilter}-${providerFilter}-${appFilter}-${endpointFilter}-${finishReasonFilter}-${streamFilter}-${errorCodeFilter}-${statusCodeFilter}-${keyFilter}-${statusFilter}-${requestFilter}-${sessionFilter}-${sortField}-${sortDir}`;
	}, [
		timeRange,
		modelFilter,
		providerFilter,
		appFilter,
		endpointFilter,
		finishReasonFilter,
		streamFilter,
		errorCodeFilter,
		statusCodeFilter,
		keyFilter,
		statusFilter,
		requestFilter,
		sessionFilter,
		sortField,
		sortDir,
	]);

	const [currentCacheKey, setCurrentCacheKey] = useState(getCacheKey());

	// Fetch a specific page
	const fetchPage = useCallback(
		async (pageNum: number, background = false) => {
			if (!background) {
				setLoading(true);
			} else {
				setIsBackgroundLoading(true);
			}

			try {
				const params: PaginatedRequestsParams = {
					timeRange,
					modelFilter: modelFilter || null,
					providerFilter: providerFilter || null,
					appFilter: appFilter || null,
					endpointFilter: endpointFilter || null,
					finishReasonFilter: finishReasonFilter || null,
					streamFilter:
						streamFilter === "streaming" || streamFilter === "non_streaming"
							? streamFilter
							: "all",
					errorCodeFilter: errorCodeFilter || null,
					statusCodeFilter:
						typeof statusCodeFilter === "string" &&
						/^[1-5]\d{2}$/.test(statusCodeFilter)
							? Number.parseInt(statusCodeFilter, 10)
							: null,
					keyFilter: keyFilter || null,
					statusFilter: (statusFilter as any) || "all",
					requestFilter: requestFilter || null,
					sessionFilter: sessionFilter || null,
					page: pageNum,
					sortField,
					sortDirection: sortDir as "asc" | "desc",
				};

				const result = await fetchPaginatedRequests(params);
				const pageModelIds = Array.from(
					new Set(
						(result.data ?? [])
							.flatMap((row) => [
								getRequestedModelId(row),
								getRoutedModelId(row),
							])
							.filter(
								(id): id is string =>
									typeof id === "string" && id.trim().length > 0,
							),
					),
				);
				const missingModelIds = pageModelIds.filter(
					(modelId) => !resolvedModelMetadata.has(modelId),
				);
				if (missingModelIds.length > 0) {
					const liveMetadata = await fetchModelMetadata(missingModelIds);
					setResolvedModelMetadata((prev) => {
						const merged = new Map(prev);
						for (const [key, value] of liveMetadata.entries()) {
							merged.set(key, value);
						}
						return merged;
					});
				}

				setPageCache((prev) => {
					const next = new Map(prev);
					next.set(pageNum, result.data);
					return next;
				});

				if (!background) {
					setTotal(result.total);
					setTotalPages(result.totalPages);
				}

				return result;
			} catch (error) {
				console.error("Error fetching requests:", error);
				if (!background) {
					setPageCache(new Map());
					setTotal(0);
					setTotalPages(0);
				}
				return null;
			} finally {
				if (!background) {
					setLoading(false);
				} else {
					setIsBackgroundLoading(false);
				}
			}
		},
		[
			timeRange,
			modelFilter,
			providerFilter,
			appFilter,
			endpointFilter,
			finishReasonFilter,
			streamFilter,
			errorCodeFilter,
			statusCodeFilter,
			keyFilter,
			statusFilter,
			requestFilter,
			sessionFilter,
			sortField,
			sortDir,
			resolvedModelMetadata,
		],
	);

	const refreshCurrentView = useCallback(async () => {
		setPageCache(new Map());
		await fetchPage(page, false);
	}, [fetchPage, page]);

	// Clear cache when filters change
	useEffect(() => {
		const newCacheKey = getCacheKey();
		if (newCacheKey !== currentCacheKey) {
			setPageCache(new Map());
			setCurrentCacheKey(newCacheKey);
			setPage(1);
		}
	}, [getCacheKey, currentCacheKey, setPage]);

	useEffect(() => {
		setResolvedModelMetadata(new Map(modelMetadata));
	}, [modelMetadata]);

	useEffect(() => {
		setResolvedProviderNames(new Map(providerNames));
	}, [providerNames]);

	useEffect(() => {
		setResolvedProviderMetadata(new Map(providerMetadata));
	}, [providerMetadata]);

	useEffect(() => {
		setPageCache(new Map([[initialPage, initialRows]]));
		setTotal(initialTotal);
		setTotalPages(initialTotalPages);
		setLoading(false);
	}, [initialPage, initialRows, initialTotal, initialTotalPages]);

	useEffect(() => registerUsageViewRefresher("logs", refreshCurrentView), [refreshCurrentView]);

	// Fetch current page and prefetch next 2 pages
	useEffect(() => {
		// Check if current page is already cached
		if (!pageCache.has(page)) {
			fetchPage(page, false);
		} else {
			setLoading(false);
		}

		// Prefetch next 2 pages in background
		for (let i = 1; i <= 2; i++) {
			const nextPage = page + i;
			if (
				nextPage <= totalPages &&
				!pageCache.has(nextPage) &&
				totalPages > 0
			) {
				fetchPage(nextPage, true);
			}
		}
	}, [page, totalPages, pageCache, fetchPage]);

	// Get current page data from cache
	const data = pageCache.get(page) || [];

	const handleSort = (field: string) => {
		if (sortField === field) {
			// Toggle direction
			setSortDir(sortDir === "asc" ? "desc" : "asc");
		} else {
			// New field, default to descending
			setSortField(field);
			setSortDir("desc");
		}
		// Reset to page 1 when sorting changes
		setPage(1);
	};

	useEffect(() => {
		if (!detailBasePath) return;
		for (const row of data.slice(0, 12)) {
			prefetchRequestDetail(row.request_id);
		}
	}, [data, detailBasePath, prefetchRequestDetail]);

	const handleRowClick = useCallback((request: RequestRow) => {
		if (detailBasePath) {
			const query = searchParams?.toString();
			router.push(
				`${detailBasePath}/${encodeURIComponent(request.request_id)}${query ? `?${query}` : ""}`,
			);
			return;
		}
		setSelectedRequest(request);
		setSelectedAppName(request.app_title ?? null);
		setDialogOpen(true);
	}, [detailBasePath, router, searchParams]);

	const handleDialogOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (
				!nextOpen &&
				detailBasePath &&
				pathname.startsWith(detailBasePath + "/")
			) {
				const query = searchParams?.toString();
				router.push(`${detailBasePath}${query ? `?${query}` : ""}`);
				return;
			}
			setDialogOpen(nextOpen);
		},
		[detailBasePath, pathname, router, searchParams],
	);

	const handleExport = React.useCallback(
		(format: "csv" | "pdf") => {
			const exportData = data.map((row) => {
				const usage = buildUsageFromNormalizedRequestFields(row.usage, row);
				const usageMeters = extractUsageMeters(usage);
				const inputTokens = usageMeters.find((m) => m.key === "input_tokens")?.value ?? 0;
				const outputTokens = usageMeters.find((m) => m.key === "output_tokens")?.value ?? 0;
				const usageSummary = usageMeters.length
					? usageMeters.map((m) => `${m.label}: ${formatUsageNumber(m.value)}`).join(" | ")
					: "-";
				const providerLabel = row.provider
					? providerNames.get(row.provider) || row.provider
					: "-";
				const appTitle = normalizeNonEmpty(row.app_title);
				const mappedAppName = normalizeNonEmpty(
					row.app_id ? appNames.get(row.app_id) : null,
				);
				const appLabel = appTitle ?? mappedAppName ?? "-";
				const requestedModelId = getRequestedModelId(row);
				const routedModelId = getRoutedModelId(row);
				return {
					Timestamp: new Date(row.created_at).toLocaleString(),
					"Requested Model": getModelDisplayName(
						requestedModelId,
						resolvedModelMetadata,
					),
					"Requested Model ID": requestedModelId || "-",
					"Routed Model": getModelDisplayName(
						routedModelId,
						resolvedModelMetadata,
					),
					"Routed Model ID": routedModelId || "-",
					Provider: providerLabel,
					App: appLabel,
					Usage: usageSummary,
					"Input Tokens": formatUsageNumber(inputTokens),
					"Output Tokens": formatUsageNumber(outputTokens),
					Cost: formatCost(row.cost_nanos),
					"Generation (ms)": row.generation_ms || row.latency_ms || "-",
					"Finish Reason": row.finish_reason || "-",
					Status: row.success ? "Success" : "Error",
				};
			});

			const timestamp = new Date().toISOString().split("T")[0];
			const filename = `gateway-requests-${timestamp}`;

			if (format === "csv") {
				exportToCSV(exportData, filename);
			} else {
				exportToPDF(exportData, filename, "Gateway Requests");
			}
		},
		[data, appNames, providerNames, resolvedModelMetadata],
	);

	// Expose export handler via ref
	React.useEffect(() => {
		if (onExportRef) {
			onExportRef.current = handleExport;
		}
	}, [onExportRef, handleExport]);

	const SortIcon = ({ field }: { field: string }) => {
		if (sortField !== field) {
			return <ArrowUpDown className="ml-2 h-4 w-4" />;
		}
		return sortDir === "asc" ? (
			<ArrowUp className="ml-2 h-4 w-4" />
		) : (
			<ArrowDown className="ml-2 h-4 w-4" />
		);
	};

	return (
		<div className="space-y-3">
			{loading && data.length === 0 ? (
				<div className="space-y-3 md:hidden">
					{Array.from({ length: 8 }).map((_, i) => (
						<div
							key={`mobile-skeleton-${i}`}
							className="animate-pulse rounded-lg border bg-card px-4 py-3"
						>
							<div className="mb-3 h-4 w-28 rounded bg-muted" />
							<div className="mb-2 h-4 w-40 rounded bg-muted" />
							<div className="mb-3 h-5 w-24 rounded bg-muted" />
							<div className="flex items-center justify-between">
								<div className="h-4 w-20 rounded bg-muted" />
								<div className="h-5 w-16 rounded bg-muted" />
							</div>
						</div>
					))}
				</div>
			) : null}

			{data.length > 0 ? (
				<div className="space-y-3 md:hidden">
					{data.map((row, index) => {
						const usageDisplay = buildUsageDisplay(
							buildUsageFromNormalizedRequestFields(row.usage, row),
						);
						const errorSummary = row.success ? null : formatErrorListSummary(row);
						const requestedModelId = getRequestedModelId(row);
						const routedModelId = getRoutedModelId(row);
						const routedModelMeta = routedModelId
							? resolvedModelMetadata.get(routedModelId)
							: undefined;
						const routedModelLabel = getModelDisplayName(
							routedModelId,
							resolvedModelMetadata,
						);
						const rowKey = `mobile-${row.request_id}-${row.created_at}-${requestedModelId ?? "no-requested-model"}-${routedModelId ?? "no-routed-model"}-${row.provider ?? "no-provider"}-${index}`;
						const modelHref = getModelDetailsHref(row.model_id);
						const modelMeta = row.model_id
							? resolvedModelMetadata.get(row.model_id)
							: undefined;
						const providerMeta = row.provider
							? resolvedProviderMetadata.get(row.provider)
							: undefined;
						const providerLabel = row.provider
							? providerNames.get(row.provider) || row.provider
							: null;
						const appTitle = normalizeNonEmpty(row.app_title);
						const mappedAppName = normalizeNonEmpty(
							row.app_id ? appNames.get(row.app_id) : null,
						);
						const appLabel = row.app_id
							? appTitle ?? mappedAppName ?? "Unknown app"
							: null;
						const appHref = row.app_id
							? `/apps/${encodeURIComponent(row.app_id)}`
							: null;
						const modelLabel = getModelDisplayName(
							row.model_id,
							resolvedModelMetadata,
						);
						const providerPolicyLabel = providerMeta?.promptTrainingPolicy
							? PROVIDER_PROMPT_TRAINING_POLICY_LABELS[
									normalizeProviderPromptTrainingPolicy(
										providerMeta.promptTrainingPolicy,
									)
							  ]
							: null;

						return (
							<button
								key={rowKey}
								type="button"
								className={cn(
									"w-full rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40",
									loading && "opacity-50",
								)}
								onMouseEnter={() => prefetchRequestDetail(row.request_id)}
								onFocus={() => prefetchRequestDetail(row.request_id)}
								onClick={() => void handleRowClick(row)}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="font-mono text-xs text-muted-foreground">
											{formatWordyDateTime(row.created_at, {
												includeTime: true,
											})}
										</div>
										<div className="mt-1 flex items-center gap-2">
											{modelMeta ? (
												<Logo
													id={modelMeta.organisationId}
													width={16}
													height={16}
													className="flex-shrink-0"
												/>
											) : null}
											<div className="min-w-0 text-sm font-medium text-foreground">
												{modelHref ? (
													<UsageEntityHoverCard
														title={modelLabel}
														subtitle={modelMeta?.organisationName ?? null}
														href={modelHref}
														visual={
															modelMeta ? (
																<Logo
																	id={modelMeta.organisationId}
																	width={16}
																	height={16}
																/>
															) : null
														}
														rows={[
															{
																label: "Model ID",
																value: (
																	<code className="font-mono text-[11px]">
																		{row.model_id}
																	</code>
																),
															},
															...(modelMeta?.organisationName
																? [
																		{
																			label: "Organisation",
																			value: modelMeta.organisationName,
																		},
																  ]
																: []),
														]}
													>
														<Link
															href={modelHref}
															className="truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
															onClick={stopRowClick}
														>
															{modelLabel}
														</Link>
													</UsageEntityHoverCard>
												) : (
													<UsageEntityHoverCard
														title={modelLabel}
														subtitle={modelMeta?.organisationName ?? null}
														visual={
															modelMeta ? (
																<Logo
																	id={modelMeta.organisationId}
																	width={16}
																	height={16}
																/>
															) : null
														}
														rows={[
															{
																label: "Model ID",
																value: (
																	<code className="font-mono text-[11px]">
																		{row.model_id}
																	</code>
																),
															},
															...(modelMeta?.organisationName
																? [
																		{
																			label: "Organisation",
																			value: modelMeta.organisationName,
																		},
																  ]
																: []),
														]}
													>
														<span className="truncate">{modelLabel}</span>
													</UsageEntityHoverCard>
												)}
												{routedModelId &&
												routedModelId !== row.model_id &&
												routedModelLabel ? (
													<div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
														<span>Routed to</span>
														{routedModelMeta ? (
															<Logo
																id={routedModelMeta.organisationId}
																width={12}
																height={12}
																className="flex-shrink-0"
															/>
														) : null}
														<span className="truncate font-medium text-foreground">
															{routedModelLabel}
														</span>
													</div>
												) : null}
											</div>
										</div>
									</div>
									<div className="shrink-0 text-right">
										<div className="font-mono text-sm text-foreground">
											{formatCost(row.cost_nanos)}
										</div>
										<div className="mt-1">
											{row.success ? (
												<Badge
													variant="outline"
													className="bg-green-50 text-green-700 border-green-200"
												>
													<CheckCircle2 className="mr-1 h-3 w-3" />
													Success
												</Badge>
											) : (
												<Badge
													variant="outline"
													className="bg-red-50 text-red-700 border-red-200"
												>
													<XCircle className="mr-1 h-3 w-3" />
													Error
												</Badge>
											)}
										</div>
									</div>
								</div>
								{errorSummary ? (
									<div className="mt-2 text-xs text-rose-700 line-clamp-2">
										{errorSummary}
									</div>
								) : null}

								<div className="mt-3 flex flex-wrap items-center gap-2">
									{row.provider ? (
										<UsageEntityHoverCard
											title={providerLabel ?? row.provider}
											href={`/api-providers/${encodeURIComponent(row.provider)}`}
											visual={
												<Logo
													id={row.provider}
													width={16}
													height={16}
												/>
											}
											rows={[
												{
													label: "Provider ID",
													value: (
														<code className="font-mono text-[11px]">
															{row.provider}
														</code>
													),
												},
												...(providerPolicyLabel
													? [
															{
																label: "Data policy",
																value: providerPolicyLabel,
															},
													  ]
													: []),
											]}
										>
											<Link
												href={`/api-providers/${encodeURIComponent(row.provider)}`}
												className="underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
												onClick={stopRowClick}
											>
												<Badge
													variant="outline"
													className="hover:bg-muted cursor-pointer inline-flex items-center gap-2"
												>
													<Logo
														id={row.provider}
														width={14}
														height={14}
														className="flex-shrink-0"
													/>
													<span className="truncate">{providerLabel}</span>
												</Badge>
											</Link>
										</UsageEntityHoverCard>
									) : null}

									{row.app_id && appLabel ? (
										<UsageEntityHoverCard
											title={appLabel}
											href={appHref}
											visual={
												isPhaseoChatApp(row) ? (
													<Logo id="phaseo" width={16} height={16} />
												) : (
													<Avatar className="h-4 w-4 rounded-[4px] border border-border/60">
														{row.app_image_url ? (
															<AvatarImage
																src={row.app_image_url}
																alt={appLabel}
																className="object-cover"
															/>
														) : null}
														<AvatarFallback className="rounded-[4px] bg-transparent text-muted-foreground">
															<AppWindow className="h-3 w-3" />
														</AvatarFallback>
													</Avatar>
												)
											}
											rows={[
												{
													label: "App ID",
													value: (
														<code className="font-mono text-[11px]">
															{row.app_id}
														</code>
													),
												},
												{
													label: "Type",
													value: isPhaseoChatApp(row) ? "Phaseo Chat" : "Workspace app",
												},
											]}
										>
											<Link
												href={appHref!}
												className="underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
												onClick={stopRowClick}
											>
												<Badge
													variant="outline"
													className="hover:bg-muted cursor-pointer inline-flex items-center gap-2"
												>
													{isPhaseoChatApp(row) ? (
														<Logo
															id="phaseo"
															width={14}
															height={14}
															className="flex-shrink-0"
														/>
													) : (
														<Avatar className="h-4 w-4 rounded-[4px] border border-border/60">
															{row.app_image_url ? (
																<AvatarImage
																	src={row.app_image_url}
																	alt={appLabel}
																	className="object-cover"
																/>
															) : null}
															<AvatarFallback className="rounded-[4px] bg-transparent text-muted-foreground">
																<AppWindow className="h-3 w-3" />
															</AvatarFallback>
														</Avatar>
													)}
													<span className="truncate">{appLabel}</span>
												</Badge>
											</Link>
										</UsageEntityHoverCard>
									) : null}
								</div>

								<div className="mt-3 flex items-center justify-between gap-3">
									<div className="min-w-0 space-y-1 text-xs text-muted-foreground">
										<div className="flex items-center gap-1">
											<span className="font-medium text-foreground/80">Usage:</span>
											<span className="truncate">{usageDisplay.primary}</span>
										</div>
										<div className="flex items-center gap-1">
											<span className="font-medium text-foreground/80">Stop reason:</span>
											<span className="truncate">{row.finish_reason || "-"}</span>
										</div>
									</div>
								</div>
							</button>
						);
					})}
				</div>
			) : null}

			{/* Table */}
			<div className="hidden rounded-md border md:block">
				<Table className="text-xs">
					<TableHeader>
						<TableRow className="h-9">
							<TableHead className="w-[180px]">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSort("created_at")}
									className="h-7 px-2 text-xs"
								>
									Timestamp
									<SortIcon field="created_at" />
								</Button>
							</TableHead>
							<TableHead>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSort("requested_model_id")}
									className="h-7 px-2 text-xs"
								>
									Requested model
									<SortIcon field="requested_model_id" />
								</Button>
							</TableHead>
							<TableHead>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSort("routed_model_id")}
									className="h-7 px-2 text-xs"
								>
									Routed model
									<SortIcon field="routed_model_id" />
								</Button>
							</TableHead>
							<TableHead>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSort("provider")}
									className="h-7 px-2 text-xs"
								>
									Provider
									<SortIcon field="provider" />
								</Button>
							</TableHead>
							<TableHead>
								App
							</TableHead>
							<TableHead className="text-right">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSort("usage")}
									className="h-7 px-2 text-xs"
								>
									Usage
									<SortIcon field="usage" />
								</Button>
							</TableHead>
							<TableHead className="text-right">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSort("cost_nanos")}
									className="h-7 px-2 text-xs"
								>
									Cost
									<SortIcon field="cost_nanos" />
								</Button>
							</TableHead>
							<TableHead>
								Finish
							</TableHead>
							<TableHead>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSort("success")}
									className="h-7 px-2 text-xs"
								>
									Status
									<SortIcon field="success" />
								</Button>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading && data.length === 0 ? (
							<>
								{Array.from({ length: 25 }).map(
									(_, i) => (
										<TableRow
											key={`skeleton-${i}`}
											className="animate-pulse"
										>
											<TableCell className="font-mono text-xs">
												<div className="h-4 bg-muted rounded w-32" />
											</TableCell>
										<TableCell>
											<div className="h-4 bg-muted rounded w-40" />
										</TableCell>
										<TableCell>
											<div className="h-4 bg-muted rounded w-40" />
										</TableCell>
										<TableCell>
											<div className="h-5 bg-muted rounded w-20" />
										</TableCell>
											<TableCell>
												<div className="h-5 bg-muted rounded w-24" />
											</TableCell>
											<TableCell className="text-right">
												<div className="h-4 bg-muted rounded w-24 ml-auto" />
											</TableCell>
											<TableCell className="text-right">
												<div className="h-4 bg-muted rounded w-20 ml-auto" />
											</TableCell>
											<TableCell>
												<div className="h-4 bg-muted rounded w-20" />
											</TableCell>
											<TableCell>
												<div className="h-5 bg-muted rounded w-16" />
											</TableCell>
										</TableRow>
									),
								)}
							</>
						) : data.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={9}
									className="py-10 text-center text-muted-foreground"
								>
									No requests found
								</TableCell>
							</TableRow>
						) : (
							<>

								{/* Show cached data with optional loading overlay */}
								{data.map((row, index) => {
									const usageDisplay = buildUsageDisplay(
										buildUsageFromNormalizedRequestFields(row.usage, row),
									);
									const errorSummary = row.success ? null : formatErrorListSummary(row);
									const requestedModelId = getRequestedModelId(row);
									const routedModelId = getRoutedModelId(row);
									const rowKey = `${row.request_id}-${row.created_at}-${requestedModelId ?? "no-requested-model"}-${routedModelId ?? "no-routed-model"}-${row.provider ?? "no-provider"}-${index}`;
									const requestedModelHref = getModelDetailsHref(requestedModelId);
									const routedModelHref = getModelDetailsHref(routedModelId);
									const requestedModelMeta = requestedModelId
										? resolvedModelMetadata.get(requestedModelId)
										: undefined;
									const routedModelMeta = routedModelId
										? resolvedModelMetadata.get(routedModelId)
										: undefined;
									const providerMeta = row.provider
										? resolvedProviderMetadata.get(row.provider)
										: undefined;
									const providerLabel = row.provider
										? providerNames.get(row.provider) || row.provider
										: null;
									const appTitle = normalizeNonEmpty(row.app_title);
									const mappedAppName = normalizeNonEmpty(
										row.app_id ? appNames.get(row.app_id) : null,
									);
									const appLabel = row.app_id
										? appTitle ?? mappedAppName ?? "Unknown app"
										: null;
									const appHref = row.app_id
										? `/apps/${encodeURIComponent(row.app_id)}`
										: null;
									const requestedModelLabel = getModelDisplayName(
										requestedModelId,
										resolvedModelMetadata,
									);
									const routedModelLabel = getModelDisplayName(
										routedModelId,
										resolvedModelMetadata,
									);
									const providerPolicyLabel = providerMeta?.promptTrainingPolicy
										? PROVIDER_PROMPT_TRAINING_POLICY_LABELS[
												normalizeProviderPromptTrainingPolicy(
													providerMeta.promptTrainingPolicy,
												)
										  ]
										: null;

									return (
										<TableRow
											key={rowKey}
											className={cn(
												loading && "opacity-50",
												"cursor-pointer hover:bg-muted/40",
											)}
											onMouseEnter={() => prefetchRequestDetail(row.request_id)}
											onFocus={() => prefetchRequestDetail(row.request_id)}
											onClick={() => void handleRowClick(row)}
										>
											<TableCell className="py-2 font-mono text-xs">
												<HoverCard>
													<HoverCardTrigger asChild>
														<span className="cursor-help underline underline-offset-2 decoration-dotted">
															{formatWordyDateTime(row.created_at, {
																includeTime: true,
															})}
														</span>
													</HoverCardTrigger>
													<HoverCardContent
														align="start"
														className="w-auto"
													>
														<div className="grid gap-2 text-xs">
															<div className="grid grid-cols-[120px_1fr] gap-2">
																<div className="text-muted-foreground">
																	{
																		userTimeZone
																	}
																</div>
																<div className="font-mono">
																	{formatDateTime(
																		new Date(
																			row.created_at,
																		),
																		userTimeZone,
																	)}
																</div>
															</div>
															<div className="grid grid-cols-[120px_1fr] gap-2">
																<div className="text-muted-foreground">
																	UTC
																</div>
																<div className="font-mono">
																	{formatDateTime(
																		new Date(
																			row.created_at,
																		),
																		"UTC",
																	)}
																</div>
															</div>
															<div className="grid grid-cols-[120px_1fr] gap-2">
																<div className="text-muted-foreground">
																	Relative
																</div>
																<div className="font-mono">
																	{relativeNowMs
																		? formatRelativeToNow(
																				new Date(
																					row.created_at,
																				),
																				relativeNowMs,
																		  )
																		: "-"}
																</div>
															</div>
															<div className="grid grid-cols-[120px_1fr] gap-2">
																<div className="text-muted-foreground">
																	Timestamp
																</div>
																<div className="font-mono">
																	{Math.floor(
																		new Date(
																			row.created_at,
																		).getTime() /
																			1000,
																	)}
																</div>
															</div>
														</div>
													</HoverCardContent>
												</HoverCard>
											</TableCell>
											<TableCell className="py-2 font-medium truncate max-w-[200px]">
												{requestedModelId ? (
													<div className="flex items-center gap-2">
														{requestedModelMeta ? (
															<Logo
																id={requestedModelMeta.organisationId}
																width={16}
																height={16}
															className="flex-shrink-0"
														/>
													) : null}
														{requestedModelHref ? (
															<UsageEntityHoverCard
																title={requestedModelLabel}
																subtitle={requestedModelMeta?.organisationName ?? null}
																href={requestedModelHref}
																visual={
																	requestedModelMeta ? (
																		<Logo
																			id={requestedModelMeta.organisationId}
																			width={16}
																			height={16}
																		/>
																	) : null
																}
																rows={[
																	{
																		label: "Model ID",
																		value: (
																			<code className="font-mono text-[11px]">
																				{requestedModelId}
																			</code>
																		),
																	},
																	...(requestedModelMeta?.organisationName
																		? [
																				{
																					label: "Organisation",
																					value: requestedModelMeta.organisationName,
																				},
																		  ]
																		: []),
																]}
															>
																<Link
																	href={requestedModelHref}
																	className="truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
																	onClick={stopRowClick}
																>
																	{requestedModelLabel}
																</Link>
															</UsageEntityHoverCard>
														) : (
															<UsageEntityHoverCard
																title={requestedModelLabel}
																subtitle={requestedModelMeta?.organisationName ?? null}
																visual={
																	requestedModelMeta ? (
																		<Logo
																			id={requestedModelMeta.organisationId}
																			width={16}
																			height={16}
																		/>
																	) : null
																}
																rows={[
																	{
																		label: "Model ID",
																		value: (
																			<code className="font-mono text-[11px]">
																				{requestedModelId}
																			</code>
																		),
																	},
																	...(requestedModelMeta?.organisationName
																		? [
																				{
																					label: "Organisation",
																					value: requestedModelMeta.organisationName,
																				},
																		  ]
																		: []),
																]}
															>
																<span className="truncate" title={requestedModelId ?? undefined}>
																	{requestedModelLabel}
																</span>
															</UsageEntityHoverCard>
														)}
													</div>
												) : (
													"-"
												)}
											</TableCell>
											<TableCell className="py-2 font-medium truncate max-w-[200px]">
												{routedModelId ? (
													<div className="flex items-center gap-2">
														{routedModelMeta ? (
															<Logo
																id={routedModelMeta.organisationId}
																width={16}
																height={16}
																className="flex-shrink-0"
															/>
														) : null}
														{routedModelHref ? (
															<UsageEntityHoverCard
																title={routedModelLabel}
																subtitle={routedModelMeta?.organisationName ?? null}
																href={routedModelHref}
																visual={
																	routedModelMeta ? (
																		<Logo
																			id={routedModelMeta.organisationId}
																			width={16}
																			height={16}
																		/>
																	) : null
																}
																rows={[
																	{
																		label: "Model ID",
																		value: (
																			<code className="font-mono text-[11px]">
																				{routedModelId}
																			</code>
																		),
																	},
																	...(routedModelMeta?.organisationName
																		? [
																				{
																					label: "Organisation",
																					value: routedModelMeta.organisationName,
																				},
																		  ]
																		: []),
																]}
															>
																<Link
																	href={routedModelHref}
																	className="truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
																	onClick={stopRowClick}
																>
																	{routedModelLabel}
																</Link>
															</UsageEntityHoverCard>
														) : (
															<UsageEntityHoverCard
																title={routedModelLabel}
																subtitle={routedModelMeta?.organisationName ?? null}
																visual={
																	routedModelMeta ? (
																		<Logo
																			id={routedModelMeta.organisationId}
																			width={16}
																			height={16}
																		/>
																	) : null
																}
																rows={[
																	{
																		label: "Model ID",
																		value: (
																			<code className="font-mono text-[11px]">
																				{routedModelId}
																			</code>
																		),
																	},
																	...(routedModelMeta?.organisationName
																		? [
																				{
																					label: "Organisation",
																					value: routedModelMeta.organisationName,
																				},
																		  ]
																		: []),
																]}
															>
																<span className="truncate" title={routedModelId ?? undefined}>
																	{routedModelLabel}
																</span>
															</UsageEntityHoverCard>
														)}
													</div>
												) : (
													"-"
												)}
											</TableCell>
											<TableCell className="py-2">
												{row.provider ? (
													<UsageEntityHoverCard
														title={providerLabel ?? row.provider}
														href={`/api-providers/${encodeURIComponent(row.provider)}`}
														visual={<Logo id={row.provider} width={16} height={16} />}
														rows={[
															{
																label: "Provider ID",
																value: (
																	<code className="font-mono text-[11px]">
																		{row.provider}
																	</code>
																),
															},
															...(providerPolicyLabel
																? [
																		{
																			label: "Data policy",
																			value: providerPolicyLabel,
																		},
																  ]
																: []),
														]}
													>
														<Link
															href={`/api-providers/${encodeURIComponent(row.provider)}`}
															className="underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
															onClick={stopRowClick}
														>
															<Badge
																variant="outline"
																className="hover:bg-muted cursor-pointer inline-flex items-center gap-2"
															>
																<Logo
																	id={row.provider}
																	width={14}
																	height={14}
																	className="flex-shrink-0"
																/>
																<span className="truncate">{providerLabel}</span>
															</Badge>
														</Link>
													</UsageEntityHoverCard>
												) : (
													<Badge variant="outline">
														-
													</Badge>
												)}
											</TableCell>
											<TableCell className="py-2">
												{row.app_id ? (
													<UsageEntityHoverCard
														title={appLabel ?? "Unknown app"}
														href={appHref}
														visual={
															isPhaseoChatApp(row) ? (
																<Logo id="phaseo" width={16} height={16} />
															) : (
																<Avatar className="h-4 w-4 rounded-[4px] border border-border/60">
																	{row.app_image_url ? (
																		<AvatarImage
																			src={row.app_image_url}
																			alt={appLabel ?? "App"}
																			className="object-cover"
																		/>
																	) : null}
																	<AvatarFallback className="rounded-[4px] bg-transparent text-muted-foreground">
																		<AppWindow className="h-3 w-3" />
																	</AvatarFallback>
																</Avatar>
															)
														}
														rows={[
															{
																label: "App ID",
																value: (
																	<code className="font-mono text-[11px]">
																		{row.app_id}
																	</code>
																),
															},
															{
																label: "Type",
																value: isPhaseoChatApp(row) ? "Phaseo Chat" : "Workspace app",
															},
														]}
													>
														<Link
															href={appHref!}
															className="underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
															onClick={stopRowClick}
														>
															<Badge
																variant="outline"
																className="hover:bg-muted cursor-pointer inline-flex items-center gap-2"
															>
																{isPhaseoChatApp(row) ? (
																	<Logo
																		id="phaseo"
																		width={14}
																		height={14}
																		className="flex-shrink-0"
																	/>
																) : (
																	<Avatar className="h-4 w-4 rounded-[4px] border border-border/60">
																		{row.app_image_url ? (
																			<AvatarImage
																				src={row.app_image_url}
																				alt={appLabel ?? "App"}
																				className="object-cover"
																			/>
																		) : null}
																		<AvatarFallback className="rounded-[4px] bg-transparent text-muted-foreground">
																			<AppWindow className="h-3 w-3" />
																		</AvatarFallback>
																	</Avatar>
																)}
																<span className="truncate">
																	{appLabel}
																</span>
															</Badge>
														</Link>
													</UsageEntityHoverCard>
												) : (
													<Badge variant="outline">
														-
													</Badge>
												)}
											</TableCell>
											<TableCell className="py-2 text-right">
												<Tooltip>
													<TooltipTrigger asChild>
														<div className="cursor-help inline-flex max-w-[180px] items-center justify-end truncate font-mono text-xs tabular-nums">
															{usageDisplay.primary}
														</div>
													</TooltipTrigger>
													<TooltipContent>
														<div className="space-y-1 font-mono tabular-nums">
															{usageDisplay.tooltipLines.map((line, idx) => (
																<p key={`${row.request_id}-usage-${idx}`}>{line}</p>
															))}
														</div>
													</TooltipContent>
												</Tooltip>
											</TableCell>
											<TableCell className="py-2 text-right font-mono text-xs">
												{formatCost(row.cost_nanos)}
											</TableCell>
											<TableCell className="py-2 text-xs text-muted-foreground">
												{row.finish_reason || "-"}
											</TableCell>
											<TableCell className="py-2">
												<div className="space-y-1">
													{row.success ? (
														<Badge
															variant="outline"
															className="bg-green-50 text-green-700 border-green-200"
														>
															<CheckCircle2 className="mr-1 h-3 w-3" />
															Success
														</Badge>
													) : (
														<Badge
															variant="outline"
															className="bg-red-50 text-red-700 border-red-200"
														>
															<XCircle className="mr-1 h-3 w-3" />
															Error
														</Badge>
													)}
													{errorSummary ? (
														<div className="max-w-[220px] text-xs text-rose-700 line-clamp-2">
															{errorSummary}
														</div>
													) : null}
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</>
						)}
					</TableBody>
				</Table>
			</div>

			{/* Pagination */}
			{totalPages > 1 ? (
				<div className="flex items-center justify-center">
					<div className="flex items-center gap-1">
					{/* Quick back to page 1 - only show when page 1 is not visible */}
					{page > 3 && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage(1)}
							disabled={loading}
						>
							<ChevronsLeft className="h-4 w-4" />
						</Button>
					)}

					<Button
						variant="outline"
						size="sm"
						onClick={() => setPage(Math.max(1, page - 1))}
						disabled={page === 1 || loading}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>

					{/* Page numbers - show current and 2 on each side */}
					{Array.from({ length: totalPages }, (_, i) => i + 1)
						.filter((p) => {
							// Show current page, and up to 2 pages on each side
							const diff = Math.abs(p - page);
							return diff <= 2;
						})
						.map((p) => (
							<Button
								key={p}
								variant={p === page ? "default" : "outline"}
								size="sm"
								onClick={() => setPage(p)}
								disabled={loading}
								className="min-w-[32px]"
							>
								{p}
							</Button>
						))}

					<Button
						variant="outline"
						size="sm"
						onClick={() => setPage(Math.min(totalPages, page + 1))}
						disabled={page >= totalPages || loading}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
					</div>
				</div>
			) : null}

			{/* Detail Dialog */}
			<RequestDetailDialog
				open={dialogOpen}
				onOpenChange={handleDialogOpenChange}
				request={selectedRequest}
				modelMetadata={resolvedModelMetadata}
				providerNames={resolvedProviderNames}
				providerMetadata={resolvedProviderMetadata}
				providerName={
					selectedRequest?.provider
						? resolvedProviderNames.get(selectedRequest.provider) ||
							selectedRequest.provider
						: null
				}
				appName={selectedAppName}
			/>
		</div>
	);
}
