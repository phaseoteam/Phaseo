"use client";

import React, { useState, useEffect, useCallback } from "react";
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
	Eye,
} from "lucide-react";
import {
	fetchPaginatedRequests,
	PaginatedRequestsParams,
	RequestRow,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import RequestDetailDialog from "./RequestDetailDialog";
import { exportToCSV, exportToPDF } from "./export-utils";
import ExportDropdown from "./ExportDropdown";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { formatRelativeToNow } from "@/lib/formatRelative";

interface UnifiedRequestsTableProps {
	timeRange: { from: string; to: string };
	appNames: Map<string, string>;
	modelMetadata: Map<
		string,
		{ organisationId: string; organisationName: string }
	>;
	providerNames: Map<string, string>;
	onExportRef?: React.MutableRefObject<
		((format: "csv" | "pdf") => void) | null
	>;
}

function getTokens(usage: any): {
	input: number;
	output: number;
	total: number;
} {
	const input =
		Number(usage?.input_text_tokens ?? usage?.input_tokens ?? 0) || 0;
	const output =
		Number(usage?.output_text_tokens ?? usage?.output_tokens ?? 0) || 0;
	const total = Number(usage?.total_tokens ?? 0) || input + output;
	return { input, output, total };
}

function formatCost(nanos: number | null | undefined): string {
	const dollars = Number(nanos ?? 0) / 1e9;
	return `$${dollars.toFixed(5)}`;
}

function formatDateTime(date: Date, timeZone: string): string {
	return new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		fractionalSecondDigits: 3,
		hour12: false,
		timeZone,
	}).format(date);
}

function getModelDetailsHref(modelId: string | null): string | null {
	if (!modelId) return null;
	const [organisationId, ...modelParts] = modelId.split("/");
	if (!organisationId || modelParts.length === 0) return null;
	const routeModelId = modelParts.join("/");
	return `/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(routeModelId)}`;
}

export default function UnifiedRequestsTable({
	timeRange,
	appNames,
	modelMetadata,
	providerNames,
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

	// Local state
	const [pageCache, setPageCache] = useState<Map<number, RequestRow[]>>(
		new Map(),
	);
	const [total, setTotal] = useState(0);
	const [totalPages, setTotalPages] = useState(0);
	const [loading, setLoading] = useState(true);
	const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
	const [selectedRequest, setSelectedRequest] = useState<RequestRow | null>(
		null,
	);
	const [dialogOpen, setDialogOpen] = useState(false);

	// Build cache key from filters
	const getCacheKey = useCallback(() => {
		return `${timeRange.from}-${timeRange.to}-${modelFilter}-${providerFilter}-${keyFilter}-${statusFilter}-${sortField}-${sortDir}`;
	}, [
		timeRange,
		modelFilter,
		providerFilter,
		keyFilter,
		statusFilter,
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
					page: pageNum,
					sortField,
					sortDirection: sortDir as "asc" | "desc",
				};

				const result = await fetchPaginatedRequests(params);

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
			sortField,
			sortDir,
		],
	);

	// Clear cache when filters change
	useEffect(() => {
		const newCacheKey = getCacheKey();
		if (newCacheKey !== currentCacheKey) {
			setPageCache(new Map());
			setCurrentCacheKey(newCacheKey);
			setPage(1);
		}
	}, [getCacheKey, currentCacheKey, setPage]);

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

	const handleRowClick = (request: RequestRow) => {
		setSelectedRequest(request);
		setDialogOpen(true);
	};

	const handleExport = React.useCallback(
		(format: "csv" | "pdf") => {
			const exportData = data.map((row) => {
				const tokens = getTokens(row.usage);
				const providerLabel = row.provider
					? providerNames.get(row.provider) || row.provider
					: "-";
				return {
					Timestamp: new Date(row.created_at).toLocaleString(),
					Model: row.model_id || "-",
					Provider: providerLabel,
					App: appNames.get(row.app_id || "") || "-",
					"Input Tokens": tokens.input,
					"Output Tokens": tokens.output,
					Cost: formatCost(row.cost_nanos),
					"Speed (ms)": row.generation_ms || row.latency_ms || "-",
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
		[data, appNames, providerNames],
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
		<div className="space-y-4">
			{/* Table */}
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[180px]">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSort("created_at")}
									className="h-8 px-2"
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
									className="h-8 px-2"
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
									className="h-8 px-2"
								>
									Provider
									<SortIcon field="provider" />
								</Button>
							</TableHead>
							<TableHead>App</TableHead>
							<TableHead className="text-right">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSort("usage")}
									className="h-8 px-2"
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
									className="h-8 px-2"
								>
									Cost
									<SortIcon field="cost_nanos" />
								</Button>
							</TableHead>
							<TableHead>Finish</TableHead>
							<TableHead>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSort("success")}
									className="h-8 px-2"
								>
									Status
									<SortIcon field="success" />
								</Button>
							</TableHead>
							<TableHead className="w-[80px] text-center">
								Actions
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.length === 0 && !loading ? (
							<TableRow>
								<TableCell
									colSpan={10}
									className="text-center py-8 text-muted-foreground"
								>
									No requests found
								</TableCell>
							</TableRow>
						) : (
							<>
								{/* Show skeleton rows when loading and no cached data */}
								{loading && data.length === 0 && (
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
														<div className="h-4 bg-muted rounded w-24" />
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
													<TableCell>
														<div className="h-8 bg-muted rounded w-8 mx-auto" />
													</TableCell>
												</TableRow>
											),
										)}
									</>
								)}

								{/* Show cached data with optional loading overlay */}
								{data.map((row, index) => {
									const tokens = getTokens(row.usage);
									const rowKey = `${row.request_id}-${row.created_at}-${row.model_id ?? "no-model"}-${row.provider ?? "no-provider"}-${index}`;
									const modelHref = getModelDetailsHref(row.model_id);
									const modelMeta = row.model_id
										? modelMetadata.get(row.model_id)
										: undefined;
									const providerLabel = row.provider
										? providerNames.get(row.provider) || row.provider
										: null;

									return (
										<TableRow
											key={rowKey}
											className={cn(
												loading && "opacity-50",
											)}
										>
											<TableCell className="font-mono text-xs">
												<HoverCard>
													<HoverCardTrigger asChild>
														<span className="cursor-help underline underline-offset-2 decoration-dotted">
															{new Date(
																row.created_at,
															).toLocaleString()}
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
											<TableCell className="font-medium truncate max-w-[200px]">
												{row.model_id ? (
													<div className="flex items-center gap-2">
														{modelMeta ? (
															<Logo
																id={modelMeta.organisationId}
																width={16}
																height={16}
																className="rounded flex-shrink-0"
															/>
														) : null}
														{modelHref ? (
															<Link
																href={modelHref}
																className="hover:underline hover:text-primary truncate"
															>
																{row.model_id}
															</Link>
														) : (
															<span className="truncate">
																{row.model_id}
															</span>
														)}
													</div>
												) : (
													"-"
												)}
											</TableCell>
											<TableCell>
												{row.provider ? (
													<div className="flex items-center gap-2">
														<Logo
															id={row.provider}
															width={16}
															height={16}
															className="rounded flex-shrink-0"
														/>
														<Link
															href={`/api-providers/${encodeURIComponent(row.provider)}`}
															className="hover:underline hover:text-primary"
														>
															<Badge
																variant="outline"
																className="hover:bg-muted cursor-pointer"
															>
																{providerLabel}
															</Badge>
														</Link>
													</div>
												) : (
													<Badge variant="outline">
														-
													</Badge>
												)}
											</TableCell>
											<TableCell className="truncate max-w-[150px]">
												{row.app_id ? (
													<Link
														href={`/apps/${encodeURIComponent(row.app_id)}`}
														className="hover:underline hover:text-primary"
													>
														{appNames.get(
															row.app_id,
														) || row.app_id}
													</Link>
												) : (
													"-"
												)}
											</TableCell>
											<TableCell className="text-right">
												<Tooltip>
													<TooltipTrigger asChild>
														<div className="cursor-help inline-flex items-center justify-end font-mono text-sm tabular-nums">
															<span
																className="inline-block text-right"
																style={{
																	minWidth:
																		"5ch",
																}}
															>
																{tokens.input.toLocaleString()}
															</span>
															<span className="text-muted-foreground mx-1">
																|
															</span>
															<span
																className="inline-block text-left"
																style={{
																	minWidth:
																		"5ch",
																}}
															>
																{tokens.output.toLocaleString()}
															</span>
														</div>
													</TooltipTrigger>
													<TooltipContent>
														<p className="font-mono tabular-nums">
															{tokens.input.toLocaleString()}{" "}
															input |{" "}
															{tokens.output.toLocaleString()}{" "}
															output
														</p>
													</TooltipContent>
												</Tooltip>
											</TableCell>
											<TableCell className="text-right font-mono text-sm">
												{formatCost(row.cost_nanos)}
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												{row.finish_reason || "-"}
											</TableCell>
											<TableCell>
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
											</TableCell>
											<TableCell className="text-center">
												<Button
													variant="ghost"
													size="sm"
													onClick={() =>
														handleRowClick(row)
													}
													className="h-8 w-8 p-0"
													title="View request details"
												>
													<Eye className="h-4 w-4" />
												</Button>
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
				appName={
					selectedRequest?.app_id
						? appNames.get(selectedRequest.app_id)
						: null
				}
			/>
		</div>
	);
}
