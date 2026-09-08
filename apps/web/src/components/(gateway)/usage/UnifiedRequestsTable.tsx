"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useQueryState } from "nuqs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	CheckCircle2,
	XCircle,
	Download,
	AppWindow,
	Bot,
	Braces,
	Package,
	Terminal,
	Loader2,
	Copy,
	PanelRightOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
	fetchPaginatedRequests,
	fetchModelMetadata,
	fetchGenerationLog,
	PaginatedRequestsParams,
	type InvestigateGenerationResult,
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
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";

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
	initialHasMore: boolean;
	initialNextCursor: { createdAt: string; id: string } | null;
	initialPageSize: number;
	detailBasePath?: string;
	onExportRef?: React.MutableRefObject<
		((format: "csv" | "pdf") => void) | null
	>;
}

function RequestRowContextMenu({
	row,
	modelId,
	onInspect,
}: {
	row: RequestRow;
	modelId: string | null;
	onInspect: () => void;
}) {
	const requestId = row.request_id?.trim() || null;
	const sessionId = row.session_id?.trim() || null;
	const nativeResponseId = row.native_response_id?.trim() || null;
	const resolvedModelId = modelId?.trim() || null;
	const canInspect = Boolean(requestId && !row.is_sample);
	const hasCopyAction = Boolean(
		requestId || sessionId || nativeResponseId || resolvedModelId,
	);
	const copyValue = async (label: string, value: string) => {
		try {
			await navigator.clipboard.writeText(value);
			toast.success(`${label} copied`);
		} catch {
			toast.error(`Failed to copy ${label.toLowerCase()}`);
		}
	};

	return (
		<ContextMenuContent className="w-56 rounded-md">
			{canInspect ? (
				<ContextMenuItem className="rounded-md" onClick={onInspect}>
					<PanelRightOpen />
					Open Request Details
				</ContextMenuItem>
			) : null}
			{canInspect && hasCopyAction ? <ContextMenuSeparator /> : null}
			{requestId ? (
				<ContextMenuItem
					className="rounded-md"
					onClick={() => void copyValue("Request ID", requestId)}
				>
					<Copy />
					Copy Request ID
				</ContextMenuItem>
			) : null}
			{sessionId ? (
				<ContextMenuItem
					className="rounded-md"
					onClick={() => void copyValue("Session ID", sessionId)}
				>
					<Copy />
					Copy Session ID
				</ContextMenuItem>
			) : null}
			{nativeResponseId ? (
				<ContextMenuItem
					className="rounded-md"
					onClick={() => void copyValue("Native response ID", nativeResponseId)}
				>
					<Copy />
					Copy Native Response ID
				</ContextMenuItem>
			) : null}
			{resolvedModelId ? (
				<ContextMenuItem
					className="rounded-md"
					onClick={() => void copyValue("Model ID", resolvedModelId)}
				>
					<Copy />
					Copy Model ID
				</ContextMenuItem>
			) : null}
		</ContextMenuContent>
	);
}

function isInteractiveRowTarget(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		Boolean(
			target.closest(
				'a, button, input, select, textarea, [role="button"], [role="link"], [data-row-click-ignore]',
			),
		)
	);
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
	const requested = getRequestedModelId(row);
	const routed = normalizeNonEmpty(row.routed_model_id) ?? normalizeNonEmpty(row.model_id);
	if (requested && routed && /(?::free|-free)$/i.test(requested)) {
		const base = (value: string) => value.replace(/(?::free|-free)$/i, "").toLowerCase();
		if (base(requested) === base(routed)) return requested;
	}
	return routed;
}

const PHASEO_CHAT_APP_KEYS = new Set([
	"phaseo-chat@phaseo.app",
	"https://phaseo.app/chat",
	"phaseo-chat@phaseo.app",
	"phaseo-chat@phaseo.app",
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

function getClientSource(row: RequestRow) {
	if (row.client_source_id) {
		return {
			id: row.client_source_id,
			name: row.client_source_name || row.client_source_id,
			version: row.client_source_version || null,
			detection: row.client_source_detection || null,
			kind: row.client_source_kind || null,
		};
	}
	const metadata = row.detail_metadata;
	const source = metadata && typeof metadata === "object" && !Array.isArray(metadata)
		? metadata.client_source
		: null;
	if (!source || typeof source !== "object" || Array.isArray(source)) {
		return {
			id: "api",
			name: "Direct HTTP",
			version: null,
			detection: "unknown",
			kind: "api",
		};
	}
	const id = typeof source.id === "string" ? source.id : null;
	if (!id) {
		return {
			id: "api",
			name: "Direct HTTP",
			version: null,
			detection: "unknown",
			kind: "api",
		};
	}
	return {
		id,
		name: typeof source.name === "string" ? source.name : id,
		version: typeof source.version === "string" ? source.version : null,
		detection: typeof source.detection === "string" ? source.detection : null,
		kind: typeof source.kind === "string" ? source.kind : null,
	};
}

function ClientSourceIcon({ kind }: { kind: string }) {
	const className = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
	if (kind === "coding_agent" || kind === "agent_sdk") return <Bot className={className} />;
	if (kind === "sdk") return <Package className={className} />;
	if (kind === "http_client") return <Terminal className={className} />;
	return <Braces className={className} />;
}

function ClientSourceVisual({ sourceId, kind }: { sourceId: string; kind: string }) {
	const imageClassName = "h-4 w-4 shrink-0 object-contain";
	if (sourceId === "codex") return <Logo id="codex" width={16} height={16} className={imageClassName} />;
	if (sourceId === "claude-code") return <Logo id="claudecode" width={16} height={16} className={imageClassName} />;
	if (sourceId.includes("typescript")) {
		return <Image src="/languages/typescript.svg" alt="TypeScript" width={16} height={16} className={imageClassName} />;
	}
	if (sourceId.includes("python")) {
		return <Image src="/languages/python.svg" alt="Python" width={16} height={16} className={imageClassName} />;
	}
	return <ClientSourceIcon kind={kind} />;
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
	initialHasMore,
	initialNextCursor,
	initialPageSize,
	detailBasePath,
	onExportRef,
}: UnifiedRequestsTableProps) {
	const userTimeZone =
		typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			: "UTC";
	// Cursor pagination is deliberately ordered newest-first. Supporting arbitrary
	// sort columns would require a distinct stable cursor and index for each sort.
	const [page, setPage] = useQueryState("page", {
		defaultValue: 1,
		parse: (value) => Math.max(1, parseInt(value || "1", 10)),
		serialize: (value) => String(value),
	});
	const [pageSize, setPageSize] = useQueryState("per_page", {
		defaultValue: initialPageSize,
		parse: (value) => {
			const parsed = Number.parseInt(value || String(initialPageSize), 10);
			return [25, 50, 100].includes(parsed) ? parsed : initialPageSize;
		},
		serialize: (value) => String(value),
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
	const [sourceFilter] = useQueryState("source");
	const [labelKey] = useQueryState("label_key");
	const [labelValue] = useQueryState("label_value");
	const [inputTokensFilter] = useQueryState("input_tokens");
	const [inputTokensMax] = useQueryState("input_tokens_max");
	const [inputTokensOperator] = useQueryState("input_tokens_op");
	const [outputTokensFilter] = useQueryState("output_tokens");
	const [outputTokensMax] = useQueryState("output_tokens_max");
	const [outputTokensOperator] = useQueryState("output_tokens_op");
	const [totalTokensFilter] = useQueryState("total_tokens");
	const [totalTokensMax] = useQueryState("total_tokens_max");
	const [totalTokensOperator] = useQueryState("total_tokens_op");
	const searchParams = useSearchParams();
	const filterOperators = React.useMemo(() => ({
		model: searchParams.get("model_op") ?? "is",
		provider: searchParams.get("provider_op") ?? "is",
		app: searchParams.get("app_op") ?? "is",
		endpoint: searchParams.get("endpoint_op") ?? "is",
		finish: searchParams.get("finish_op") ?? "is",
		stream: searchParams.get("stream_op") ?? "is",
		error: searchParams.get("error_op") ?? "is",
		http: searchParams.get("http_op") ?? "is",
		key: searchParams.get("key_op") ?? "is",
		status: searchParams.get("status_op") ?? "is",
		source: searchParams.get("source_op") ?? "is",
	}), [searchParams]);
	const [detailRequestId, setDetailRequestId] = useQueryState("request", {
		history: "push",
		shallow: true,
	});

	// Local state
	const [pageCache, setPageCache] = useState<Map<number, RequestRow[]>>(
		() => new Map([[initialPage, initialRows]]),
	);
	const [pageCursors, setPageCursors] = useState<Map<number, { createdAt: string; id: string } | null>>(
		() => new Map([[1, null], [2, initialNextCursor]]),
	);
	const [hasMoreByPage, setHasMoreByPage] = useState<Map<number, boolean>>(
		() => new Map([[1, initialHasMore]]),
	);
	const [total, setTotal] = useState(initialTotal);
	const [totalPages, setTotalPages] = useState(initialTotalPages);
	const [loading, setLoading] = useState(false);
	const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
	const inFlightPages = React.useRef(new Set<number>());
	const [selectedRequest, setSelectedRequest] = useState<RequestRow | null>(null);
	const [selectedDetail, setSelectedDetail] =
		useState<InvestigateGenerationResult | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
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
		return `${timeRange.from}-${timeRange.to}-${pageSize}-${modelFilter}-${providerFilter}-${appFilter}-${endpointFilter}-${finishReasonFilter}-${streamFilter}-${errorCodeFilter}-${statusCodeFilter}-${keyFilter}-${statusFilter}-${requestFilter}-${sessionFilter}-${sourceFilter}-${labelKey}-${labelValue}-${inputTokensFilter}-${inputTokensMax}-${inputTokensOperator}-${outputTokensFilter}-${outputTokensMax}-${outputTokensOperator}-${totalTokensFilter}-${totalTokensMax}-${totalTokensOperator}-${JSON.stringify(filterOperators)}`;
	}, [
		timeRange,
		pageSize,
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
		sourceFilter,
		labelKey,
		labelValue,
		inputTokensFilter, inputTokensMax, inputTokensOperator,
		outputTokensFilter, outputTokensMax, outputTokensOperator,
		totalTokensFilter, totalTokensMax, totalTokensOperator,
		filterOperators,
	]);

	const [currentCacheKey, setCurrentCacheKey] = useState(getCacheKey());

	// Fetch a specific page
	const fetchPage = useCallback(
		async (pageNum: number, background = false) => {
			if (inFlightPages.current.has(pageNum)) return null;
			const cursor = pageNum === 1 ? null : pageCursors.get(pageNum);
			if (pageNum > 1 && !cursor) return null;
			inFlightPages.current.add(pageNum);

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
					sourceFilter: sourceFilter || null,
					labelKey: labelKey || null,
					labelValue: labelValue || null,
					filterOperators,
					inputTokensFilter: inputTokensFilter || null,
					inputTokensMax: inputTokensMax || null,
					inputTokensOperator: inputTokensOperator || "gte",
					outputTokensFilter: outputTokensFilter || null,
					outputTokensMax: outputTokensMax || null,
					outputTokensOperator: outputTokensOperator || "gte",
					totalTokensFilter: totalTokensFilter || null,
					totalTokensMax: totalTokensMax || null,
					 totalTokensOperator: totalTokensOperator || "gte",
					cursor,
					pageSize,
					sortField: "created_at",
					sortDirection: "desc",
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
				setHasMoreByPage((prev) => new Map(prev).set(pageNum, result.hasMore));
				setPageCursors((prev) => new Map(prev).set(pageNum + 1, result.nextCursor));

				if (!background) {
					setTotal((pageNum - 1) * pageSize + result.data.length);
					setTotalPages(result.hasMore ? pageNum + 1 : pageNum);
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
				inFlightPages.current.delete(pageNum);
				if (!background) {
					setLoading(false);
				} else {
					setIsBackgroundLoading(false);
				}
			}
		},
		[
			timeRange,
			pageSize,
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
			sourceFilter,
			labelKey,
			labelValue,
			pageCursors,
			filterOperators,
			inputTokensFilter, inputTokensMax, inputTokensOperator,
			outputTokensFilter, outputTokensMax, outputTokensOperator,
			totalTokensFilter, totalTokensMax, totalTokensOperator,
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
			setPageCursors(new Map([[1, null]]));
			setHasMoreByPage(new Map());
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
		setPageCursors(new Map([[1, null], [2, initialNextCursor]]));
		setHasMoreByPage(new Map([[1, initialHasMore]]));
		setTotal(initialTotal);
		setTotalPages(initialTotalPages);
		setLoading(false);
	}, [initialHasMore, initialNextCursor, initialPage, initialRows, initialTotal, initialTotalPages]);

	useEffect(() => registerUsageViewRefresher("logs", refreshCurrentView), [refreshCurrentView]);

	// Fetch current page and prefetch next 2 pages
	useEffect(() => {
		// Check if current page is already cached
		if (!pageCache.has(page)) {
			fetchPage(page, false);
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

	useEffect(() => {
		if (!detailBasePath || !detailRequestId) return;
		let cancelled = false;
		const row = data.find((item) => item.request_id === detailRequestId) ?? null;
		if (row) {
			setSelectedRequest(row);
			setSelectedAppName(row.app_title ?? null);
			setDialogOpen(true);
		}
		setDetailLoading(true);
		void fetchGenerationLog(detailRequestId).then((result) => {
			if (cancelled || !result.success || !result.data) return;
			setSelectedDetail(result.data);
			setSelectedRequest(result.data.request);
			setSelectedAppName(result.data.appName);
			setDialogOpen(true);
		}).finally(() => {
			if (!cancelled) setDetailLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [data, detailBasePath, detailRequestId]);

	const handleRowClick = useCallback((request: RequestRow) => {
		if (request.is_sample) return;
		const isSelectedRequest = detailBasePath
			? detailRequestId === request.request_id
			: selectedRequest?.request_id === request.request_id;
		if (isSelectedRequest && (detailBasePath || dialogOpen)) {
			setDialogOpen(false);
			setSelectedRequest(null);
			setSelectedDetail(null);
			setDetailLoading(false);
			if (detailBasePath) void setDetailRequestId(null);
			return;
		}
		setSelectedRequest(request);
		setSelectedDetail(null);
		setDetailLoading(Boolean(detailBasePath));
		setSelectedAppName(request.app_title ?? null);
		setDialogOpen(true);
		if (detailBasePath) {
			void setDetailRequestId(request.request_id);
		}
	}, [detailBasePath, detailRequestId, dialogOpen, selectedRequest?.request_id, setDetailRequestId]);

	const handleDialogOpenChange = useCallback(
		(nextOpen: boolean) => {
			setDialogOpen(nextOpen);
			if (!nextOpen) {
				setSelectedDetail(null);
				setDetailLoading(false);
				if (detailBasePath) void setDetailRequestId(null);
			}
		},
		[detailBasePath, setDetailRequestId],
	);
	const navigableRows = React.useMemo(
		() => data.filter((row) => !row.is_sample),
		[data],
	);
	const activeRequestId =
		(selectedDetail?.request ?? selectedRequest)?.request_id ?? detailRequestId;
	const activeRequestIndex = activeRequestId
		? navigableRows.findIndex((row) => row.request_id === activeRequestId)
		: -1;
	const previousRequest =
		activeRequestIndex > 0 ? navigableRows[activeRequestIndex - 1] : null;
	const nextRequest =
		activeRequestIndex >= 0 && activeRequestIndex < navigableRows.length - 1
			? navigableRows[activeRequestIndex + 1]
			: null;

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
					? resolveProviderDisplayName({ providerId: row.provider, providerName: providerNames.get(row.provider) || resolvedProviderMetadata.get(row.provider)?.name || row.provider })
					: "-";
				const appTitle = normalizeNonEmpty(row.app_title);
				const mappedAppName = normalizeNonEmpty(
					row.app_id ? appNames.get(row.app_id) : null,
				);
				const appLabel = appTitle ?? mappedAppName ?? "-";
				const source = getClientSource(row);
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
					Source: source?.name ?? "Direct HTTP",
					"Source ID": source?.id ?? "api",
					"Source Type": source?.kind ?? "api",
					"Source Version": source?.version ?? "-",
					"Source Detection": source?.detection ?? "unknown",
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

	return (
		<div className="space-y-3">
		{loading && data.length === 0 ? (
			<div className="flex items-center gap-3 rounded-md border border-border/70 bg-muted/15 px-3 py-2.5 text-sm" role="status" aria-live="polite">
				<Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
				<div className="min-w-0">
					<p className="font-medium text-foreground">Loading requests</p>
					<p className="truncate text-xs text-muted-foreground">Searching the selected time range and applying your filters.</p>
				</div>
			</div>
		) : null}
			{loading && data.length === 0 ? (
				<div className="space-y-3 lg:hidden">
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
				<div className="space-y-3 lg:hidden">
					{data.map((row, index) => {
						const usageDisplay = buildUsageDisplay(
							buildUsageFromNormalizedRequestFields(row.usage, row),
						);
						const requestedModelId = getRequestedModelId(row);
						const routedModelId = getRoutedModelId(row);
						const rowKey = `mobile-${row.request_id}-${row.created_at}-${requestedModelId ?? "no-requested-model"}-${routedModelId ?? "no-routed-model"}-${row.provider ?? "no-provider"}-${index}`;
						const modelHref = row.provider === "private-model"
							? "/settings/workspaces/private-models"
							: getModelDetailsHref(routedModelId);
						const modelMeta = routedModelId
							? resolvedModelMetadata.get(routedModelId)
							: undefined;
						const providerMeta = row.provider
							? resolvedProviderMetadata.get(row.provider)
							: undefined;
						const providerLabel = row.provider
							? resolveProviderDisplayName({ providerId: row.provider, providerName: providerNames.get(row.provider) || providerMeta?.name || row.provider })
							: null;
						const source = getClientSource(row);
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
							<button
								key={rowKey}
								type="button"
								className={cn(
									"w-full rounded-lg border border-l-2 border-l-transparent bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40",
									loading && "opacity-50",
									detailRequestId === row.request_id &&
										"border-l-foreground bg-muted/55",
								)}
								aria-pressed={detailRequestId === row.request_id}
								data-request-row-id={row.request_id}
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
																						{routedModelId}
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
													className="truncate font-medium text-foreground underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-foreground"
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
																						{routedModelId}
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
											className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300"
												>
													<CheckCircle2 className="mr-1 h-3 w-3" />
													Success
												</Badge>
											) : (
												<Badge
													variant="outline"
											className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-300"
												>
													<XCircle className="mr-1 h-3 w-3" />
													Error
												</Badge>
											)}
										</div>
									</div>
								</div>
								<div className="mt-3 flex flex-wrap items-center gap-2">
									{source ? (
										<UsageEntityHoverCard
											title={source.name}
											subtitle={source.kind === "coding_agent" ? "Coding agent" : source.kind === "sdk" ? "Software development kit" : source.kind === "http_client" ? "HTTP client" : null}
											visual={<ClientSourceVisual sourceId={source.id} kind={source.kind ?? ""} />}
											rows={[
												...(source.version ? [{ label: "Version", value: source.version }] : []),
												...(source.detection ? [{ label: "Detection", value: source.detection === "declared" ? "Declared by client" : source.detection === "user_agent" ? "User agent" : source.detection }] : []),
											]}
										>
											<span className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground">
												<ClientSourceVisual sourceId={source.id} kind={source.kind ?? ""} />
												<span className="truncate">{source.name}</span>
											</span>
										</UsageEntityHoverCard>
									) : null}

									{row.provider ? (
										<UsageEntityHoverCard
											title={providerLabel ?? row.provider}
											href={row.provider === "private-model" ? "/settings/workspaces/private-models" : `/api-providers/${encodeURIComponent(row.provider)}`}
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
											href={row.provider === "private-model" ? "/settings/workspaces/private-models" : `/api-providers/${encodeURIComponent(row.provider)}`}
											className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-foreground"
												onClick={stopRowClick}
											>
											<Logo id={row.provider} width={14} height={14} className="flex-shrink-0" />
											<span className="truncate">{providerLabel}</span>
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
												className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-foreground"
												onClick={stopRowClick}
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
			<div className="hidden min-w-0 max-w-full overflow-hidden rounded-md border lg:block">
				<ScrollArea
					className="w-full"
					scrollBarOrientation="horizontal"
					keepScrollbarMounted
					viewportClassName="w-full pb-2"
				>
				<Table wrapInContainer={false} className="min-w-[1080px] whitespace-nowrap text-xs">
					<TableHeader>
						<TableRow className="h-9">
							<TableHead className="w-[180px]">Timestamp</TableHead>
							<TableHead className="hidden">Requested model</TableHead>
							<TableHead>Model</TableHead>
							<TableHead>
								Source
							</TableHead>
							<TableHead>Provider</TableHead>
							<TableHead>
								App
							</TableHead>
							<TableHead className="text-right">Usage</TableHead>
							<TableHead className="text-right">Cost</TableHead>
							<TableHead>
								Finish
							</TableHead>
							<TableHead>Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading && data.length === 0 ? (
							<>
								{Array.from({ length: Math.min(pageSize, 20) }).map(
									(_, i) => (
										<TableRow
											key={`skeleton-${i}`}
											className="animate-pulse"
										>
											<TableCell className="font-mono text-xs">
												<div className="h-4 bg-muted rounded w-32" />
											</TableCell>
						<TableCell className="hidden">
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
									colSpan={10}
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
									const requestedModelId = getRequestedModelId(row);
									const routedModelId = getRoutedModelId(row);
									const rowKey = `${row.request_id}-${row.created_at}-${requestedModelId ?? "no-requested-model"}-${routedModelId ?? "no-routed-model"}-${row.provider ?? "no-provider"}-${index}`;
									const requestedModelHref = row.provider === "private-model"
										? "/settings/workspaces/private-models"
										: getModelDetailsHref(requestedModelId);
									const routedModelHref = row.provider === "private-model"
										? "/settings/workspaces/private-models"
										: getModelDetailsHref(routedModelId);
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
										? resolveProviderDisplayName({ providerId: row.provider, providerName: providerNames.get(row.provider) || providerMeta?.name || row.provider })
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
										<ContextMenu key={rowKey}>
											<ContextMenuTrigger asChild>
											<TableRow
											className={cn(
												loading && "opacity-50",
												"cursor-pointer border-l-2 border-l-transparent hover:bg-muted/40",
												detailRequestId === row.request_id &&
													"border-l-2 border-l-foreground bg-muted/65 hover:bg-muted/65",
											)}
											aria-selected={detailRequestId === row.request_id}
											data-request-row-id={row.request_id}
											onClickCapture={(event) => {
												if (!isInteractiveRowTarget(event.target)) {
													void handleRowClick(row);
												}
											}}
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
											<TableCell className="hidden py-2 font-medium truncate max-w-[200px]">
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
																	className="truncate font-medium text-foreground underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-foreground"
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
																	className="truncate font-medium text-foreground underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-foreground"
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
											{(() => {
												const source = getClientSource(row);
												if (!source) return "-";
												return (
													<UsageEntityHoverCard
														title={source.name}
														subtitle={source.kind === "coding_agent" ? "Coding agent" : source.kind === "sdk" ? "Software development kit" : source.kind === "http_client" ? "HTTP client" : null}
														visual={<ClientSourceVisual sourceId={source.id} kind={source.kind ?? ""} />}
														rows={[
															...(source.version ? [{ label: "Version", value: source.version }] : []),
															...(source.detection ? [{ label: "Detection", value: source.detection === "declared" ? "Declared by client" : source.detection === "user_agent" ? "User agent" : source.detection }] : []),
														]}
													>
														<span className="inline-flex max-w-[170px] items-center gap-1.5 truncate text-foreground/80">
															<ClientSourceVisual sourceId={source.id} kind={source.kind ?? ""} />
																<span className="truncate">{source.name}</span>
															</span>
														</UsageEntityHoverCard>
													);
												})()}
											</TableCell>
											<TableCell className="py-2">
												<div className="flex min-h-5 items-center">
												{row.provider ? (
													<UsageEntityHoverCard
														title={providerLabel ?? row.provider}
													href={row.provider === "private-model" ? "/settings/workspaces/private-models" : `/api-providers/${encodeURIComponent(row.provider)}`}
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
														href={row.provider === "private-model" ? "/settings/workspaces/private-models" : `/api-providers/${encodeURIComponent(row.provider)}`}
															className="inline-flex min-w-0 max-w-[180px] items-center gap-2 font-medium text-foreground underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-foreground"
															onClick={stopRowClick}
														>
															<Logo id={row.provider} width={14} height={14} className="flex-shrink-0" />
															<span className="truncate">{providerLabel}</span>
														</Link>
													</UsageEntityHoverCard>
												) : (
													<span className="text-muted-foreground">-</span>
												)}
												</div>
											</TableCell>
											<TableCell className="py-2">
												<div className="flex min-h-5 items-center">
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
															className="inline-flex min-w-0 max-w-[180px] items-center gap-2 font-medium text-foreground underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-foreground"
															onClick={stopRowClick}
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
															<span className="truncate">{appLabel}</span>
														</Link>
													</UsageEntityHoverCard>
												) : (
													<span className="text-muted-foreground">-</span>
												)}
												</div>
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
												<div>
													{row.success ? (
														<Badge
															variant="outline"
													className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300"
														>
															<CheckCircle2 className="mr-1 h-3 w-3" />
															Success
														</Badge>
													) : (
														<Badge
															variant="outline"
													className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-300"
														>
															<XCircle className="mr-1 h-3 w-3" />
															Error
														</Badge>
													)}
												</div>
											</TableCell>
											</TableRow>
											</ContextMenuTrigger>
											<RequestRowContextMenu
												row={row}
												modelId={routedModelId}
												onInspect={() => void handleRowClick(row)}
											/>
										</ContextMenu>
									);
								})}
							</>
						)}
					</TableBody>
				</Table>
				</ScrollArea>
			</div>

			{/* Pagination */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>Rows per page</span>
					<Select value={String(pageSize)} onValueChange={(value) => { void setPageSize(Number(value)); void setPage(1); }}>
						<SelectTrigger size="sm" className="h-8 w-[72px] rounded-md border-border/70 bg-background">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="rounded-md">
							{[25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
						</SelectContent>
					</Select>
				</div>
				{totalPages > 1 ? (
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
				) : <span />}
			</div>

			{/* Detail Dialog */}
			<RequestDetailDialog
				open={dialogOpen}
				loading={detailLoading}
				presentation={detailBasePath ? "sheet" : undefined}
				disablePointerDismissal={Boolean(detailBasePath)}
				headerNavigation={
					activeRequestIndex >= 0 ? (
						<div className="flex items-center gap-2">
							<div className="flex items-center gap-1">
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									disabled={!previousRequest}
									aria-label="Open previous request"
									onClick={() => previousRequest && handleRowClick(previousRequest)}
								>
									<ChevronLeft className="size-4" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									disabled={!nextRequest}
									aria-label="Open next request"
									onClick={() => nextRequest && handleRowClick(nextRequest)}
								>
									<ChevronRight className="size-4" />
								</Button>
							</div>
							<span className="min-w-8 text-right text-[10px] font-medium tabular-nums text-muted-foreground">
								{activeRequestIndex + 1} / {navigableRows.length}
							</span>
						</div>
					) : null
				}
				onOpenChange={handleDialogOpenChange}
				request={selectedDetail?.request ?? selectedRequest}
				modelMetadata={selectedDetail ? new Map(selectedDetail.modelMetadata ?? []) : resolvedModelMetadata}
				providerNames={selectedDetail ? new Map(selectedDetail.providerNames ?? []) : resolvedProviderNames}
				providerMetadata={selectedDetail ? new Map(selectedDetail.providerMetadata ?? []) : resolvedProviderMetadata}
				providerName={
					(selectedDetail?.request ?? selectedRequest)?.provider
						? (selectedDetail ? new Map(selectedDetail.providerNames ?? []) : resolvedProviderNames).get((selectedDetail?.request ?? selectedRequest)!.provider!) ||
							(selectedDetail?.request ?? selectedRequest)!.provider
						: null
				}
				appName={selectedDetail?.appName ?? selectedAppName}
				ioLog={selectedDetail?.ioLog}
			/>
		</div>
	);
}
