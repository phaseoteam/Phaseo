"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useQueryState } from "nuqs";
import Link from "next/link";
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
import {
	formatDateTime,
	formatWordyDateTime,
} from "@/lib/gateway/usage/timeFormatting";
import { formatErrorListSummary } from "@/lib/gateway/usage/errorListSummary";
import { registerUsageViewRefresher } from "@/lib/gateway/usage/refreshBus";
import { buildUsageDisplay, extractUsageMeters, formatUsageNumber } from "./usageMeters";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";

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

function isAiStatsChatApp(row: RequestRow): boolean {
	const key = normalizeNonEmpty(row.app_key)?.toLowerCase();
	if (!key) return false;
	return (
		key === "ai-stats-chat@ai-stats.phaseo.app" ||
		key === "https://ai-stats.phaseo.app/chat"
	);
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
	onExportRef,
}: UnifiedRequestsTableProps) {
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

	// Build cache key from filters
	const getCacheKey = useCallback(() => {
		return `${timeRange.from}-${timeRange.to}-${modelFilter}-${providerFilter}-${keyFilter}-${statusFilter}-${requestFilter}-${sessionFilter}-${sortField}-${sortDir}`;
	}, [
		timeRange,
		modelFilter,
		providerFilter,
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
							.map((row) => row.model_id)
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

	const handleRowClick = useCallback((request: RequestRow) => {
		setSelectedRequest(request);
		setSelectedAppName(request.app_title ?? null);
		setDialogOpen(true);
	}, []);

	const handleExport = React.useCallback(
		(format: "csv" | "pdf") => {
			const exportData = data.map((row) => {
				const usageMeters = extractUsageMeters(row.usage);
				const inputTokens = usageMeters.find((m) => m.key === "input_text_tokens")?.value ?? 0;
				const outputTokens = usageMeters.find((m) => m.key === "output_text_tokens")?.value ?? 0;
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
				return {
					Timestamp: new Date(row.created_at).toLocaleString(),
					Model: getModelDisplayName(row.model_id, resolvedModelMetadata),
					"Model ID": row.model_id || "-",
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
			{data.length === 0 && !loading ? (
				<div className="rounded-md border py-8 text-center text-muted-foreground">
					No requests found
				</div>
			) : null}

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
						const usageDisplay = buildUsageDisplay(row.usage);
						const errorSummary = row.success ? null : formatErrorListSummary(row);
						const rowKey = `mobile-${row.request_id}-${row.created_at}-${row.model_id ?? "no-model"}-${row.provider ?? "no-provider"}-${index}`;
						const modelHref = getModelDetailsHref(row.model_id);
						const modelMeta = row.model_id
							? resolvedModelMetadata.get(row.model_id)
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

						return (
							<button
								key={rowKey}
								type="button"
								className={cn(
									"w-full rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40",
									loading && "opacity-50",
								)}
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
													<Link
														href={modelHref}
														className="truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
														onClick={stopRowClick}
													>
														{modelLabel}
													</Link>
												) : (
													<span className="truncate">{modelLabel}</span>
												)}
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
									) : null}

									{row.app_id && appLabel ? (
										<Link
											href={appHref!}
											className="underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
											onClick={stopRowClick}
										>
											<Badge
												variant="outline"
												className="hover:bg-muted cursor-pointer inline-flex items-center gap-2"
											>
												{isAiStatsChatApp(row) ? (
													<Logo
														id="ai-stats"
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
									onClick={() => handleSort("model_id")}
									className="h-7 px-2 text-xs"
								>
									Model
									<SortIcon field="model_id" />
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
						) : (
							<>

								{/* Show cached data with optional loading overlay */}
								{data.map((row, index) => {
									const usageDisplay = buildUsageDisplay(row.usage);
									const errorSummary = row.success ? null : formatErrorListSummary(row);
									const rowKey = `${row.request_id}-${row.created_at}-${row.model_id ?? "no-model"}-${row.provider ?? "no-provider"}-${index}`;
									const modelHref = getModelDetailsHref(row.model_id);
									const modelMeta = row.model_id
										? resolvedModelMetadata.get(row.model_id)
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

									return (
										<TableRow
											key={rowKey}
											className={cn(
												loading && "opacity-50",
												"cursor-pointer hover:bg-muted/40",
											)}
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
												{row.model_id ? (
													<div className="flex items-center gap-2">
														{modelMeta ? (
															<Logo
																id={modelMeta.organisationId}
																width={16}
																height={16}
																className="flex-shrink-0"
															/>
														) : null}
														{modelHref ? (
															<Link
																href={modelHref}
																className="underline decoration-transparent hover:decoration-current transition-colors duration-200 hover:text-primary truncate"
																onClick={stopRowClick}
															>
																{modelLabel}
															</Link>
														) : (
															<span className="truncate" title={row.model_id ?? undefined}>
																{modelLabel}
															</span>
														)}
													</div>
												) : (
													"-"
												)}
											</TableCell>
											<TableCell className="py-2">
												{row.provider ? (
													<Link
														href={`/api-providers/${encodeURIComponent(row.provider)}`}
														className="underline decoration-transparent hover:decoration-current transition-colors duration-200 hover:text-primary"
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
												) : (
													<Badge variant="outline">
														-
													</Badge>
												)}
											</TableCell>
											<TableCell className="py-2">
												{row.app_id ? (
													<Link
														href={appHref!}
														className="underline decoration-transparent hover:decoration-current transition-colors duration-200 hover:text-primary"
														onClick={stopRowClick}
													>
														<Badge
															variant="outline"
															className="hover:bg-muted cursor-pointer inline-flex items-center gap-2"
														>
															{isAiStatsChatApp(row) ? (
																<Logo
																	id="ai-stats"
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

			{/* Detail Dialog */}
                        <RequestDetailDialog
                                open={dialogOpen}
                                onOpenChange={setDialogOpen}
                                request={selectedRequest}
                                modelMetadata={resolvedModelMetadata}
                                providerNames={resolvedProviderNames}
                                providerMetadata={resolvedProviderMetadata}
                                providerName={
                                        selectedRequest?.provider
                                                ? resolvedProviderNames.get(
                                                          selectedRequest.provider,
                                                  ) || selectedRequest.provider
                                                : null
                                }
                                appName={selectedAppName}
                        />
		</div>
	);
}
