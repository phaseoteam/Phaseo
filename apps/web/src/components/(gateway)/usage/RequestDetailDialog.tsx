"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppWindow, Bot, Braces, Copy, Database, GraduationCap, Info, ListFilter, LoaderCircle, Package, ShieldCheck, ShieldQuestion, Terminal, XCircle } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Logo } from "@/components/Logo";
import {
	RequestRow,
	type GatewayIoLog,
	type ProviderMetadataEntry,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { cn } from "@/lib/utils";
import {
	buildUsageFromNormalizedRequestFields,
	extractUsageMeters,
	formatUsageNumber,
	type UsageMeter,
} from "./usageMeters";
import {
	DetailKeyValueGrid,
	DetailTimingBar,
} from "./DetailDialogPrimitives";
import { formatWordyDateTime } from "@/lib/gateway/usage/timeFormatting";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";
import {
	PROVIDER_PROMPT_TRAINING_POLICY_LABELS,
	normalizeProviderPromptTrainingPolicy,
} from "@/lib/providers/promptTrainingPolicy";
import { formatRoomError } from "@/lib/chat/formatRoomError";
import UsageEntityHoverCard from "./UsageEntityHoverCard";
import { RoutingTracePanel } from "@/components/(gateway)/usage/RoutingTracePanel";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";

interface RequestDetailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	request: RequestRow | null;
	appName?: string | null;
	modelMetadata?: ModelMetadataMap;
	providerName?: string | null;
	providerNames?: Map<string, string>;
	providerMetadata?: Map<string, ProviderMetadataEntry>;
	headerNavigation?: React.ReactNode;
	headerActions?: React.ReactNode;
	ioLog?: GatewayIoLog | null;
	presentation?: "dialog" | "sheet";
	disablePointerDismissal?: boolean;
	loading?: boolean;
}

type ProviderAttemptRow = RequestRow["provider_attempts"][number];

function formatRequestPricingLine(line: RequestRow["pricing_lines"][number]): string {
	if (line == null) return "null";
	if (
		typeof line === "string" ||
		typeof line === "number" ||
		typeof line === "boolean"
	) {
		return String(line);
	}
	const provider =
		typeof line.provider === "string" && line.provider.trim().length > 0
			? line.provider.trim()
			: null;
	const endpoint =
		typeof line.endpoint === "string" && line.endpoint.trim().length > 0
			? line.endpoint.trim()
			: null;
	const dimension =
		typeof line.dimension === "string" && line.dimension.trim().length > 0
			? line.dimension.trim()
			: null;
	const units =
		typeof line.units === "number"
			? line.units
			: typeof line.units === "string" && line.units.trim().length > 0
				? line.units.trim()
				: null;
	const costUsd =
		typeof line.cost_usd === "number"
			? line.cost_usd.toFixed(6)
			: typeof line.cost_usd === "string" && line.cost_usd.trim().length > 0
				? line.cost_usd.trim()
				: null;
	const costNanos =
		typeof line.cost_nanos === "number"
			? line.cost_nanos.toLocaleString()
			: typeof line.cost_nanos === "string" && line.cost_nanos.trim().length > 0
				? line.cost_nanos.trim()
				: null;

	const parts = [
		provider,
		endpoint,
		dimension ? `${dimension}${units != null ? `=${units}` : ""}` : null,
		costUsd ? `$${costUsd}` : null,
		costNanos ? `${costNanos} nanos` : null,
	].filter(Boolean);

	return parts.length > 0 ? parts.join(" | ") : JSON.stringify(line);
}

function formatDiagnosticLabel(value: string): string {
	return value
		.split("_")
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(" ");
}

function renderProviderBadge(
	providerId: string,
	providerNames?: Map<string, string>,
): React.ReactNode {
	return (
		<code
			key={providerId}
			className="rounded bg-rose-100 px-1.5 py-0.5 text-xs"
		>
			{providerNames?.get(providerId) ?? providerId}
		</code>
	);
}

function renderCodeBadge(value: string): React.ReactNode {
	return (
		<code key={value} className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
			{value}
		</code>
	);
}

function extractGuardrailEnforcement(value: Record<string, unknown> | null): {
	source: string | null;
	action: string | null;
	guardrailIds: string[];
	detectionCount: number | null;
	redactionCount: number | null;
	detectors: Array<{
		detectorId: string | null;
		category: string | null;
		variant: string | null;
	}>;
} | null {
	const payload =
		value?.guardrail_enforcement &&
		typeof value.guardrail_enforcement === "object" &&
		!Array.isArray(value.guardrail_enforcement)
			? (value.guardrail_enforcement as Record<string, unknown>)
			: null;
	if (!payload) return null;

	const normalizeStringList = (input: unknown): string[] =>
		Array.isArray(input)
			? input
					.map((entry) => (typeof entry === "string" ? entry.trim() : ""))
					.filter(Boolean)
			: [];
	const normalizeCount = (input: unknown): number | null => {
		if (typeof input === "number" && Number.isFinite(input)) return input;
		if (typeof input === "string" && input.trim()) {
			const parsed = Number(input);
			return Number.isFinite(parsed) ? parsed : null;
		}
		return null;
	};

	return {
		source: typeof payload.source === "string" ? payload.source : null,
		action:
			typeof payload.action === "string"
				? payload.action
				: Array.isArray(payload.actions) && typeof payload.actions[0] === "string"
					? String(payload.actions[0])
					: null,
		guardrailIds: normalizeStringList(
			payload.guardrail_ids ?? payload.guardrailIds,
		),
		detectionCount: normalizeCount(
			payload.detection_count ?? payload.detectionCount,
		),
		redactionCount: normalizeCount(
			payload.redaction_count ?? payload.redactionCount,
		),
		detectors: Array.isArray(payload.detectors)
			? payload.detectors.map((entry) => {
					const record =
						entry && typeof entry === "object" && !Array.isArray(entry)
							? (entry as Record<string, unknown>)
							: {};
					return {
						detectorId:
							typeof record.detector_id === "string"
								? record.detector_id
								: typeof record.detectorId === "string"
									? record.detectorId
									: null,
						category:
							typeof record.category === "string" ? record.category : null,
						variant:
							typeof record.variant === "string" ? record.variant : null,
					};
			  })
			: [],
	};
}

function extractPluginExecutions(
	value: Record<string, unknown> | null,
): Array<{
	id: string;
	stage: string | null;
	status: string | null;
	changed: boolean;
	attempted: boolean | null;
	healed: boolean | null;
	mode: string | null;
	failureReason: string | null;
	reason: string | null;
	errorMessage: string | null;
	transformsApplied: string[];
	validationErrors: string[];
}> {
	const input = value?.plugin_executions;
	if (!Array.isArray(input)) return [];

	return input
		.map((entry) => {
			const record =
				entry && typeof entry === "object" && !Array.isArray(entry)
					? (entry as Record<string, unknown>)
					: null;
			if (!record || typeof record.id !== "string" || !record.id.trim()) {
				return null;
			}

			const metadata =
				record.metadata &&
				typeof record.metadata === "object" &&
				!Array.isArray(record.metadata)
					? (record.metadata as Record<string, unknown>)
					: null;

			return {
				id: record.id.trim(),
				stage: typeof record.stage === "string" ? record.stage : null,
				status: typeof record.status === "string" ? record.status : null,
				changed: record.changed === true,
				attempted:
					typeof metadata?.attempted === "boolean"
						? metadata.attempted
						: null,
				healed:
					typeof metadata?.healed === "boolean" ? metadata.healed : null,
				mode: typeof metadata?.mode === "string" ? metadata.mode : null,
				failureReason:
					typeof metadata?.failure_reason === "string"
						? metadata.failure_reason
						: null,
				reason:
					typeof metadata?.reason === "string" ? metadata.reason : null,
				errorMessage:
					typeof metadata?.error === "string" ? metadata.error : null,
				transformsApplied: Array.isArray(metadata?.transforms_applied)
					? metadata.transforms_applied
							.map((item) => (typeof item === "string" ? item.trim() : ""))
							.filter(Boolean)
					: [],
				validationErrors: Array.isArray(metadata?.validation_errors)
					? metadata.validation_errors
							.map((item) => (typeof item === "string" ? item.trim() : ""))
							.filter(Boolean)
					: [],
			};
		})
		.filter(
			(
				entry,
			): entry is {
				id: string;
				stage: string | null;
				status: string | null;
				changed: boolean;
				attempted: boolean | null;
				healed: boolean | null;
				mode: string | null;
				failureReason: string | null;
				reason: string | null;
				errorMessage: string | null;
				transformsApplied: string[];
				validationErrors: string[];
			} => entry !== null,
		);
}

function extractSearchObservability(
	value: Record<string, unknown> | null,
): {
	usedNativeWebSearch: boolean;
	usedManagedWebSearch: boolean;
	resultCount: number;
	citationCount: number;
	nativeSearches: Array<{
		type: string | null;
		query: string | null;
		status: string | null;
	}>;
	results: Array<{
		type: string | null;
		title: string | null;
		url: string | null;
		snippet: string | null;
	}>;
	citations: Array<{
		type: string | null;
		title: string | null;
		url: string | null;
		text: string | null;
	}>;
	managedSearches: Array<{
		provider: string | null;
		query: string | null;
		requestId: string | null;
		searchType: string | null;
		resultCount: number;
	}>;
} | null {
	const payload =
		value?.search_observability &&
		typeof value.search_observability === "object" &&
		!Array.isArray(value.search_observability)
			? (value.search_observability as Record<string, unknown>)
			: null;
	if (!payload) return null;

	const normalizeCount = (input: unknown): number =>
		typeof input === "number" && Number.isFinite(input)
			? input
			: typeof input === "string" && input.trim()
				? Number(input) || 0
				: 0;
	const normalizeString = (input: unknown): string | null =>
		typeof input === "string" && input.trim().length > 0 ? input.trim() : null;

	const results = Array.isArray(payload.results)
		? payload.results
				.map((entry) => {
					const record =
						entry && typeof entry === "object" && !Array.isArray(entry)
							? (entry as Record<string, unknown>)
							: null;
					if (!record) return null;
					return {
						type: normalizeString(record.type),
						title: normalizeString(record.title),
						url: normalizeString(record.url),
						snippet: normalizeString(record.snippet),
					};
				})
				.filter(
					(
						entry,
					): entry is {
						type: string | null;
						title: string | null;
						url: string | null;
						snippet: string | null;
					} => entry !== null,
				)
		: [];
	const citations = Array.isArray(payload.citations)
		? payload.citations
				.map((entry) => {
					const record =
						entry && typeof entry === "object" && !Array.isArray(entry)
							? (entry as Record<string, unknown>)
							: null;
					if (!record) return null;
					return {
						type: normalizeString(record.type),
						title: normalizeString(record.title),
						url: normalizeString(record.url),
						text: normalizeString(record.text),
					};
				})
				.filter(
					(
						entry,
					): entry is {
						type: string | null;
						title: string | null;
						url: string | null;
						text: string | null;
					} => entry !== null,
				)
		: [];
	const nativeSearches = Array.isArray(payload.nativeSearches)
		? payload.nativeSearches
				.map((entry) => {
					const record =
						entry && typeof entry === "object" && !Array.isArray(entry)
							? (entry as Record<string, unknown>)
							: null;
					if (!record) return null;
					return {
						type: normalizeString(record.type),
						query: normalizeString(record.query),
						status: normalizeString(record.status),
					};
				})
				.filter(
					(
						entry,
					): entry is {
						type: string | null;
						query: string | null;
						status: string | null;
					} => entry !== null,
				)
		: [];
	const managedSearches = Array.isArray(payload.managedSearches)
		? payload.managedSearches
				.map((entry) => {
					const record =
						entry && typeof entry === "object" && !Array.isArray(entry)
							? (entry as Record<string, unknown>)
							: null;
					if (!record) return null;
					return {
						provider: normalizeString(record.provider),
						query: normalizeString(record.query),
						requestId: normalizeString(record.requestId),
						searchType: normalizeString(record.searchType),
						resultCount: normalizeCount(record.resultCount),
					};
				})
				.filter(
					(
						entry,
					): entry is {
						provider: string | null;
						query: string | null;
						requestId: string | null;
						searchType: string | null;
						resultCount: number;
					} => entry !== null,
				)
		: [];

	return {
		usedNativeWebSearch: payload.usedNativeWebSearch === true,
		usedManagedWebSearch: payload.usedManagedWebSearch === true,
		resultCount: normalizeCount(payload.resultCount),
		citationCount: normalizeCount(payload.citationCount),
		nativeSearches,
		results,
		citations,
		managedSearches,
	};
}

function extractWebFetchObservability(
	value: Record<string, unknown> | null,
): {
	requestCount: number;
	fetches: Array<{
		provider: string | null;
		url: string | null;
		finalUrl: string | null;
		title: string | null;
		status: number | null;
		contentType: string | null;
		returnedChars: number;
		truncated: boolean;
	}>;
} | null {
	const payload =
		value?.web_fetch_observability &&
		typeof value.web_fetch_observability === "object" &&
		!Array.isArray(value.web_fetch_observability)
			? (value.web_fetch_observability as Record<string, unknown>)
			: null;
	if (!payload) return null;

	const normalizeCount = (input: unknown): number =>
		typeof input === "number" && Number.isFinite(input)
			? input
			: typeof input === "string" && input.trim()
				? Number(input) || 0
				: 0;
	const normalizeString = (input: unknown): string | null =>
		typeof input === "string" && input.trim().length > 0 ? input.trim() : null;
	const normalizeMaybeNumber = (input: unknown): number | null => {
		if (typeof input === "number" && Number.isFinite(input)) return input;
		if (typeof input === "string" && input.trim()) {
			const value = Number(input);
			if (Number.isFinite(value)) return value;
		}
		return null;
	};

	const fetches = Array.isArray(payload.fetches)
		? payload.fetches
				.map((entry) => {
					const record =
						entry && typeof entry === "object" && !Array.isArray(entry)
							? (entry as Record<string, unknown>)
							: null;
					if (!record) return null;
					return {
						provider: normalizeString(record.provider),
						url: normalizeString(record.url),
						finalUrl: normalizeString(record.finalUrl ?? record.final_url),
						title: normalizeString(record.title),
						status: normalizeMaybeNumber(record.status),
						contentType: normalizeString(record.contentType ?? record.content_type),
						returnedChars: normalizeCount(record.returnedChars ?? record.returned_chars),
						truncated: record.truncated === true,
					};
				})
				.filter(
					(
						entry,
					): entry is {
						provider: string | null;
						url: string | null;
						finalUrl: string | null;
						title: string | null;
						status: number | null;
						contentType: string | null;
						returnedChars: number;
						truncated: boolean;
					} => entry !== null,
				)
		: [];

	if (fetches.length === 0) return null;

	return {
		requestCount: normalizeCount(payload.requestCount),
		fetches,
	};
}

function formatCost(nanos: number | null | undefined): string {
	const dollars = Number(nanos ?? 0) / 1e9;
	return `$${dollars.toFixed(5)}`;
}

function formatThroughput(value: number | string | null | undefined): string {
	if (value === null || value === undefined) return "-";
	const n = Number(value);
	if (!Number.isFinite(n)) return "-";
	return `${Math.round(n * 100) / 100} tok/s`;
}

function formatDuration(ms: number | null | undefined): string {
	const value = Number(ms ?? 0);
	if (!Number.isFinite(value) || value <= 0) return "-";
	if (value < 1000) return `${Math.round(value)} ms`;
	if (value < 60_000) {
		const seconds = value / 1000;
		return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} s`;
	}
	const minutes = Math.floor(value / 60_000);
	const seconds = Math.round((value % 60_000) / 1000);
	return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatScoreValue(value: number | null | undefined): string {
	const numeric = Number(value ?? NaN);
	return Number.isFinite(numeric) ? numeric.toFixed(3) : "-";
}

function getConcreteModelParts(args: {
	apiModelId?: string | null;
	providerModelSlug?: string | null;
}): string[] {
	const values = [
		typeof args.apiModelId === "string" && args.apiModelId.trim().length > 0
			? args.apiModelId.trim()
			: null,
		typeof args.providerModelSlug === "string" &&
		args.providerModelSlug.trim().length > 0
			? args.providerModelSlug.trim()
			: null,
	].filter((value): value is string => Boolean(value));
	return values.length > 0 ? [values[0]] : [];
}

function normalizeModelId(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function getRequestedModelId(request: RequestRow): string | null {
	return normalizeModelId(request.requested_model_id) ?? normalizeModelId(request.model_id);
}

function getRoutedModelId(request: RequestRow): string | null {
	const requested = getRequestedModelId(request);
	const routed = normalizeModelId(request.routed_model_id) ?? normalizeModelId(request.model_id);
	if (requested && routed && /(?::free|-free)$/i.test(requested)) {
		const base = (value: string) => value.replace(/(?::free|-free)$/i, "").toLowerCase();
		if (base(requested) === base(routed)) return requested;
	}
	return routed;
}

function getAttemptStatusTone(
	attempt: ProviderAttemptRow,
): {
	badgeClass: string;
	barClass: string;
	label: string;
} {
	const status = typeof attempt.status === "number" ? attempt.status : null;
	const outcome = attempt.outcome ?? "";
	if (status !== null) {
		if (status >= 200 && status < 300) {
			return {
				badgeClass:
					"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300",
				barClass: "bg-emerald-500",
				label: String(status),
			};
		}
		if (status === 429) {
			return {
				badgeClass:
					"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
				barClass: "bg-amber-500",
				label: String(status),
			};
		}
		if (status >= 500) {
			return {
				badgeClass:
					"border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300",
				barClass: "bg-rose-500",
				label: String(status),
			};
		}
		if (status >= 400) {
			return {
				badgeClass:
					"border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-300",
				barClass: "bg-orange-500",
				label: String(status),
			};
		}
	}
	if (outcome === "success") {
		return {
			badgeClass:
				"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300",
			barClass: "bg-emerald-500",
			label: "OK",
		};
	}
	return {
		badgeClass:
			"border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
		barClass: "bg-slate-400 dark:bg-slate-500",
		label: outcome || "-",
	};
}

function getAttemptStatusDescription(attempt: ProviderAttemptRow): string | null {
	const parts = [
		typeof attempt.status_text === "string" ? attempt.status_text : null,
		typeof attempt.upstream_error_code === "string"
			? attempt.upstream_error_code
			: null,
		typeof attempt.upstream_error_message === "string"
			? attempt.upstream_error_message
			: typeof attempt.upstream_error_description === "string"
				? attempt.upstream_error_description
				: null,
	].filter(Boolean);

	if (parts.length === 0) return null;
	return parts.join(" · ");
}

function getModelDetailsHref(modelId: string | null | undefined): string | null {
	if (!modelId) return null;
	const [organisationId, ...modelParts] = modelId.split("/");
	if (!organisationId || modelParts.length === 0) return null;
	return `/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(modelParts.join("/"))}`;
}

function buildUsageLogsFilterHref(args: {
	searchParams: { toString(): string } | null;
	view: "logs" | "sessions";
	requestId?: string | null;
	sessionId?: string | null;
}): string {
	const next = new URLSearchParams(args.searchParams?.toString() ?? "");
	for (const key of [
		"view",
		"page",
		"sort",
		"dir",
		"model",
		"provider",
		"key",
		"status",
		"req",
		"session",
	]) {
		next.delete(key);
	}
	if (args.requestId) next.set("req", args.requestId);
	if (args.sessionId) next.set("session", args.sessionId);
	const path = args.view === "logs" ? "/settings/usage/logs/requests" : "/settings/usage/logs/sessions";
	return next.size ? `${path}?${next.toString()}` : path;
}

function buildUsageSummary(usage: any): {
	input: number | null;
	output: number | null;
	total: number | null;
} {
	const meters = extractUsageMeters(usage);
	const find = (keys: string[]) =>
		meters.find((meter) => keys.includes(meter.key))?.value ?? null;
	const input = find(["input_tokens", "input_text_tokens"]);
	const output = find(["output_tokens", "output_text_tokens"]);
	const total =
		typeof usage?.total_tokens === "number"
			? usage.total_tokens
			: input != null && output != null
				? input + output
				: null;
	return { input, output, total };
}

function RequestHeader({
	request,
	headerNavigation,
}: {
	request: RequestRow;
	headerNavigation?: React.ReactNode;
}) {
	const timestamp = formatWordyDateTime(request.created_at, { includeTime: true });
	return (
		<div className="relative">
			{headerNavigation ? (
				<div className="absolute right-14 top-4 z-10">{headerNavigation}</div>
			) : null}
			<div className="px-5 py-4 sm:px-6 sm:py-5">
				<div className={cn("pr-10", headerNavigation && "pr-36")}>
					<DialogTitle className="text-base font-semibold">Generation details</DialogTitle>
					<div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
						<span>{timestamp}</span>
						<span aria-hidden="true">·</span>
						<CopyableText value={request.request_id} ariaLabel="Copy generation ID" />
					</div>
				</div>
			</div>
			<Separator />
		</div>
	);
}

export default function RequestDetailDialog({
	open,
	onOpenChange,
	request,
	appName,
	modelMetadata,
	providerName,
	providerNames,
	providerMetadata,
	headerNavigation,
	headerActions,
	ioLog,
	presentation = "dialog",
	disablePointerDismissal = false,
	loading = false,
}: RequestDetailDialogProps) {
	const searchParams = useSearchParams();

	if (!request) return null;
	if (loading) {
		const loadingContent = (
			<>
				<RequestHeader request={request} />
				<div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
					<div className="relative flex size-12 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/5 text-sky-600 dark:text-sky-300">
						<div className="absolute inset-1 rounded-xl border border-sky-500/10" />
						<LoaderCircle className="size-5 animate-spin" />
					</div>
					<div>
						<p className="text-sm font-medium text-foreground">Loading request details</p>
						<p className="mt-1 text-xs text-muted-foreground">Fetching routing, attempts, pricing, and stored payloads.</p>
					</div>
				</div>
			</>
		);
		if (presentation === "sheet") {
			return (
				<ProviderInspectorSheet
					open={open}
					onOpenChange={onOpenChange}
					disablePointerDismissal={disablePointerDismissal}
				>
					<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[58vw] lg:!w-[54vw] xl:!w-[50vw] 2xl:!w-[46vw] data-[side=right]:sm:max-w-none">
						{loadingContent}
					</ProviderInspectorSheetContent>
				</ProviderInspectorSheet>
			);
		}
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
					<DialogHeader className="sr-only"><DialogTitle>Loading request details</DialogTitle></DialogHeader>
					{loadingContent}
				</DialogContent>
			</Dialog>
		);
	}

	const metadata = modelMetadata ?? new Map();
	const normalizedUsage = buildUsageFromNormalizedRequestFields(request.usage, request);
	const usageMeters = extractUsageMeters(normalizedUsage);
	const internalUsageMeters = usageMeters.filter(
		(meter) =>
			meter.key.includes("quad_tokens") ||
			meter.key.endsWith("_characters") ||
			meter.key === "requests",
	);
	const nativeUsageMeters = usageMeters.filter(
		(meter) => !internalUsageMeters.some((internal) => internal.key === meter.key),
	);
	const usageSummary = buildUsageSummary(normalizedUsage);
	const timingLatency = Number(request.latency_ms ?? 0) || 0;
	const timingGeneration = Number(request.generation_ms ?? 0) || 0;
	const requestedModelId = getRequestedModelId(request);
	const routedModelId = getRoutedModelId(request);
	const requestedModelHref = getModelDetailsHref(requestedModelId);
	const modelHref = getModelDetailsHref(routedModelId);
	const modelName = getModelDisplayName(routedModelId ?? null, metadata);
	const modelMeta = routedModelId ? metadata.get(routedModelId) : undefined;
	const requestedModelName = getModelDisplayName(requestedModelId ?? null, metadata);
	const requestedModelMeta = requestedModelId ? metadata.get(requestedModelId) : undefined;
	const providerMeta = request.provider ? providerMetadata?.get(request.provider) : undefined;
	const providerPolicyLabel = providerMeta?.promptTrainingPolicy
		? PROVIDER_PROMPT_TRAINING_POLICY_LABELS[
				normalizeProviderPromptTrainingPolicy(providerMeta.promptTrainingPolicy)
			]
		: null;
	const attempts = Array.isArray(request.provider_attempts)
		? request.provider_attempts
		: [];
	const pricingLines = Array.isArray(request.pricing_lines)
		? request.pricing_lines
		: [];
	const finalSuccessAttempt = [...attempts]
		.reverse()
		.find(
			(attempt) =>
				(typeof attempt.status === "number" &&
					attempt.status >= 200 &&
					attempt.status < 300) ||
				attempt.outcome === "success",
		);
	const concreteSuccessModelParts = getConcreteModelParts({
		apiModelId: finalSuccessAttempt?.api_model_id,
		providerModelSlug: finalSuccessAttempt?.provider_model_slug,
	});
	const responseTimelineItems =
		attempts.length > 0
			? attempts.flatMap((attempt, index) => {
					const attemptProviderId = attempt.provider ?? null;
					const attemptProviderName =
						(attemptProviderId && providerNames?.get(attemptProviderId)) ||
						attemptProviderId ||
						`Attempt ${index + 1}`;
					const statusTone = getAttemptStatusTone(attempt);
					const statusDescription = getAttemptStatusDescription(attempt);
					const durationMs = Number(attempt.total_ms ?? attempt.duration_ms ?? 0) || 0;
					const attemptFinishReason =
						attempt.provider_finish_reason ?? attempt.finish_reason ?? null;
					const attemptCostNanos = Number(attempt.cost_nanos ?? 0) || 0;
					const attemptModelParts = getConcreteModelParts({
						apiModelId: attempt.api_model_id,
						providerModelSlug: attempt.provider_model_slug,
					});
					const providerRow = {
						key: `provider-${attempt.attempt_number ?? index}`,
						label: (
							<div className="flex min-w-0 items-center gap-2">
								{attemptProviderId ? <Logo id={attemptProviderId} width={14} height={14} className="shrink-0" /> : null}
								{attemptProviderId ? (
									<Link
										href={`/api-providers/${encodeURIComponent(attemptProviderId)}`}
										className="truncate font-medium text-foreground underline decoration-transparent transition-colors hover:decoration-foreground/70"
									>
										{attemptProviderName}
									</Link>
								) : (
									<span className="truncate font-medium">{attemptProviderName}</span>
								)}
								<HoverCard openDelay={100} closeDelay={100}>
									<HoverCardTrigger asChild>
									<span
										className={cn(
											"inline-flex shrink-0 cursor-default items-center justify-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium",
											statusTone.badgeClass,
										)}
									>
										{statusTone.label}
									</span>
									</HoverCardTrigger>
									<HoverCardContent
										align="start"
										sideOffset={8}
										className="w-72 rounded-md border border-border/70 p-0 shadow-xl"
									>
										<div className="border-b border-border/70 px-3 py-2.5">
											<div className="flex items-center justify-between gap-3">
												<span className="text-sm font-semibold">Provider response</span>
												<span className={cn("rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium", statusTone.badgeClass)}>
													{statusTone.label}
												</span>
											</div>
											{statusDescription ? (
												<p className="mt-1 text-xs text-muted-foreground">{statusDescription}</p>
											) : null}
										</div>
										<dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 px-3 py-2.5 text-xs">
											<dt className="text-muted-foreground">Provider</dt>
											<dd className="min-w-0 truncate text-right font-medium">
												{attemptProviderId ? (
													<Link
														href={`/api-providers/${encodeURIComponent(attemptProviderId)}`}
														className="text-foreground underline decoration-transparent transition-colors hover:decoration-foreground/70"
													>
														{attemptProviderName}
													</Link>
												) : attemptProviderName}
											</dd>
											{attemptModelParts.length > 0 ? (
												<>
													<dt className="text-muted-foreground">Model</dt>
													<dd
														className="min-w-0 truncate text-right font-mono text-[11px]"
														title={attemptModelParts[0]}
													>
														{attemptModelParts[0]}
													</dd>
												</>
											) : null}
											{attemptFinishReason ? (
												<>
													<dt className="text-muted-foreground">Finish reason</dt>
													<dd className="text-right font-medium">{attemptFinishReason}</dd>
												</>
											) : null}
											{attemptCostNanos > 0 ? (
												<>
													<dt className="text-muted-foreground">Cost</dt>
													<dd className="text-right font-mono">{formatCost(attemptCostNanos)}</dd>
												</>
											) : null}
										</dl>
									</HoverCardContent>
								</HoverCard>
							</div>
						),
						duration: durationMs,
						colorClass: statusTone.barClass,
					};

					if (
						finalSuccessAttempt === attempt &&
						timingLatency > 0 &&
						timingGeneration > 0
					) {
						return [
							{
								...providerRow,
								duration: timingLatency,
							},
							{
								key: `generation-${attempt.attempt_number ?? index}`,
								label: (
									<div className="flex min-w-0 items-center gap-2">
										<span className="truncate">Generation</span>
									</div>
								),
								duration: timingGeneration,
								colorClass: "bg-sky-500",
							},
						];
					}

					return [providerRow];
			  })
			: [
					...(timingLatency > 0
						? [
								{
								key: "provider-latency",
								label: (
									<div className="flex min-w-0 items-center gap-2">
										{request.provider ? <Logo id={request.provider} width={14} height={14} className="shrink-0" /> : null}
										<span className="min-w-0 break-words">
											{request.provider ? (
												<Link
											href={request.provider === "private-model" ? "/settings/workspaces/private-models" : `/api-providers/${encodeURIComponent(request.provider)}`}
													className="text-foreground underline decoration-transparent transition-colors hover:decoration-foreground/70"
												>
													{providerName ?? request.provider}
												</Link>
											) : "Provider"}
										</span>
									</div>
									),
									duration: timingLatency,
									colorClass: "bg-emerald-500",
								},
						  ]
						: []),
					...(timingGeneration > 0
						? [
								{
								key: "generation",
								label: (
									<div className="flex min-w-0 items-center gap-2">
										<span className="min-w-0 break-words">Generation</span>
									</div>
								),
									duration: timingGeneration,
									colorClass: "bg-sky-500",
								},
						  ]
						: []),
			  ];
	const sessionFilterHref = request.session_id
		? buildUsageLogsFilterHref({
				searchParams,
				view: "sessions",
				sessionId: request.session_id,
		  })
		: null;
	const formattedGatewayError = request.error_payload
		? formatRoomError(JSON.stringify(request.error_payload))
		: request.error_message?.trim()
			? formatRoomError(request.error_message)
			: null;
	const formattedDetailRouting = request.detail_metadata
		? formatRoomError(
				JSON.stringify({
					error: "routing_details",
					description: "Routing details",
					provider_candidate_diagnostics:
						request.detail_metadata.provider_candidate_diagnostics,
					provider_enablement:
						request.detail_metadata.provider_enablement_diagnostics,
					routing_diagnostics: request.detail_metadata.routing_diagnostics,
				}),
			)
		: null;
	const guardrailEnforcement = extractGuardrailEnforcement(request.error_payload);
	const formattedFailureSample = formattedGatewayError?.failureSample ?? [];
	const providerCandidateDiagnostics =
		formattedGatewayError?.providerCandidateDiagnostics ??
		formattedDetailRouting?.providerCandidateDiagnostics;
	const providerEnablement =
		formattedGatewayError?.providerEnablement ??
		formattedDetailRouting?.providerEnablement;
	const routingDiagnostics =
		formattedGatewayError?.routingDiagnostics ??
		formattedDetailRouting?.routingDiagnostics;
	const workspacePolicyDiagnostics = routingDiagnostics?.workspacePolicy;
	const consideredProviders = routingDiagnostics?.consideredProviders ?? [];
	const rankedProviders = routingDiagnostics?.rankedProviders ?? [];
	const storedRoutingDecisions = request.routing_decisions ?? [];
	const failedProviders = formattedGatewayError?.failedProviders ?? [];
	const failedStatuses = formattedGatewayError?.failedStatuses ?? [];
	const pluginExecutions = extractPluginExecutions(request.detail_metadata ?? null);
	const searchObservability = extractSearchObservability(
		request.detail_metadata ?? null,
	);
	const webFetchObservability = extractWebFetchObservability(
		request.detail_metadata ?? null,
	);
	const requestDetailItems = [
		{
			label: "Routed model",
			description: "The canonical Phaseo model selected after aliases, presets, and router expansion are resolved.",
			value: modelHref ? (
				<UsageEntityHoverCard
					title={modelName || routedModelId || "-"}
					subtitle={modelMeta?.organisationName ?? null}
					href={modelHref}
					visual={
						modelMeta ? (
							<Logo
								id={modelMeta.organisationId}
								width={16}
								height={16}
								className="flex-shrink-0"
							/>
						) : null
					}
					rows={[
						{
							label: "Model ID",
							value: (
								<code className="font-mono text-[11px]">
									{routedModelId ?? "-"}
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
					<div className="flex items-center gap-2">
						{modelMeta ? (
							<Logo
								id={modelMeta.organisationId}
								width={16}
								height={16}
								className="flex-shrink-0"
							/>
						) : null}
						<Link
							href={modelHref}
							className="min-w-0 truncate text-foreground underline decoration-transparent transition-colors duration-200 hover:text-foreground hover:decoration-foreground/70"
						>
							{modelName || routedModelId || "-"}
						</Link>
					</div>
				</UsageEntityHoverCard>
			) : (
				<UsageEntityHoverCard
					title={modelName || routedModelId || "-"}
					subtitle={modelMeta?.organisationName ?? null}
					visual={
						modelMeta ? (
							<Logo
								id={modelMeta.organisationId}
								width={16}
								height={16}
								className="flex-shrink-0"
							/>
						) : null
					}
					rows={[
						{
							label: "Model ID",
							value: (
								<code className="font-mono text-[11px]">
									{routedModelId ?? "-"}
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
					<div className="flex items-center gap-2">
						{modelMeta ? (
							<Logo
								id={modelMeta.organisationId}
								width={16}
								height={16}
								className="flex-shrink-0"
							/>
						) : null}
						<span className="min-w-0 truncate">
							{modelName || routedModelId || "-"}
						</span>
					</div>
				</UsageEntityHoverCard>
			),
		},
		{
			label: "Requested model",
			description: "The exact model ID or alias supplied by the client in the original request.",
			value: requestedModelId ? (
				<UsageEntityHoverCard
					title={requestedModelName || requestedModelId}
					href={requestedModelHref ?? undefined}
					visual={requestedModelMeta ? <Logo id={requestedModelMeta.organisationId} width={16} height={16} className="shrink-0" /> : null}
					rows={[{ label: "Model ID", value: <code className="font-mono text-[11px]">{requestedModelId}</code> }]}
				>
					{requestedModelHref ? (
						<Link href={requestedModelHref} className="inline-flex min-w-0 items-center justify-end gap-2 text-foreground underline decoration-transparent transition-colors hover:decoration-foreground/70">
							{requestedModelMeta ? <Logo id={requestedModelMeta.organisationId} width={16} height={16} className="shrink-0" /> : null}
							<span className="truncate">{requestedModelName || requestedModelId}</span>
						</Link>
					) : (
						<span className="truncate">{requestedModelName || requestedModelId}</span>
					)}
				</UsageEntityHoverCard>
			) : (
				"-"
			),
		},
		{
			label: "Request ID",
			value: request.request_id ? (
				<CopyableText value={request.request_id} ariaLabel="Copy request ID" />
			) : (
				"-"
			),
		},
		{
			label: "Native request ID",
			value: request.native_response_id ? (
				<CopyableText value={request.native_response_id} ariaLabel="Copy native request ID" />
			) : (
				"-"
			),
		},
		{
			label: "Provider",
			value: request.provider ? (
				<UsageEntityHoverCard
					title={providerName ?? request.provider}
				href={request.provider === "private-model" ? "/settings/workspaces/private-models" : `/api-providers/${encodeURIComponent(request.provider)}`}
					visual={
						<Logo
							id={request.provider}
							width={16}
							height={16}
							className="flex-shrink-0"
						/>
					}
					rows={[
						{
							label: "Provider ID",
							value: (
								<code className="font-mono text-[11px]">
									{request.provider}
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
					href={request.provider === "private-model" ? "/settings/workspaces/private-models" : `/api-providers/${encodeURIComponent(request.provider)}`}
					className="inline-flex items-center gap-2 text-foreground underline decoration-transparent transition-colors duration-200 hover:text-foreground hover:decoration-foreground/70"
					>
						<Logo
							id={request.provider}
							width={16}
							height={16}
							className="flex-shrink-0"
						/>
						<span>{providerName ?? request.provider}</span>
					</Link>
				</UsageEntityHoverCard>
			) : (
				"-"
			),
		},
		...(concreteSuccessModelParts.length > 0
			? [
					{
						label: "Upstream model ID",
						description: "The provider-facing model identifier sent upstream for the successful attempt.",
						value: (
							<div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
								{modelMeta ? <Logo id={modelMeta.organisationId} width={16} height={16} className="shrink-0" /> : null}
								{concreteSuccessModelParts.map((value) => (
									<code
										key={`concrete-model-${value}`}
										className="font-mono text-xs"
									>
										{value}
									</code>
								))}
							</div>
						),
					},
			  ]
			: []),
		{
			label: "Endpoint",
			value: request.endpoint ? (
				<span>{humanizeEndpoint(request.endpoint)}</span>
			) : (
				"-"
			),
		},
		{
			label: "Data policy",
			value: providerPolicyLabel ? (
				<span className="inline-flex items-center justify-end gap-2">
					<DataPolicyIcon policy={providerMeta?.promptTrainingPolicy} />
					{providerPolicyLabel}
				</span>
			) : "-",
		},
		{
			label: "App where used",
			value:
				request.app_id && appName ? (
					<UsageEntityHoverCard
						title={appName}
						href={`/apps/${encodeURIComponent(request.app_id)}`}
						visual={<AppWindow className="h-4 w-4 text-muted-foreground" />}
						rows={[
							{
								label: "App ID",
								value: (
									<code className="font-mono text-[11px]">
										{request.app_id}
									</code>
								),
							},
							{
								label: "Type",
								value: "Workspace app",
							},
						]}
					>
						<Link
							href={`/apps/${encodeURIComponent(request.app_id)}`}
							className="text-foreground underline decoration-transparent transition-colors duration-200 hover:text-foreground hover:decoration-foreground/70"
						>
							{appName}
						</Link>
					</UsageEntityHoverCard>
				) : (
					appName ?? request.app_id ?? "-"
				),
		},
		{
			label: "Session ID",
			value: request.session_id ? (
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<CopyableText value={request.session_id} ariaLabel="Copy session ID" />
					</ContextMenuTrigger>
					<ContextMenuContent className="w-48 rounded-md">
						<ContextMenuItem onClick={() => void navigator.clipboard.writeText(request.session_id!)}>
							<Copy />
							Copy Session ID
						</ContextMenuItem>
						{sessionFilterHref ? (
							<ContextMenuItem asChild>
								<Link href={sessionFilterHref}>
									<ListFilter />
									Filter by Session
								</Link>
							</ContextMenuItem>
						) : null}
					</ContextMenuContent>
				</ContextMenu>
			) : (
				"-"
			),
		},
		{
			label: "Finish reason",
			value: request.finish_reason ? humanizeValue(request.finish_reason) : "-",
		},
		{
			label: "Streaming",
			value: request.stream ? "True" : "False",
		},
		{
			label: "Status code",
			value: request.status_code ?? "-",
		},
		...(request.error_code
			? [
					{
						label: "Error code",
						value: request.error_code,
					},
			  ]
			: []),
		...(request.error_message
			? [
					{
						label: "Error message",
						value: formattedGatewayError?.message ?? request.error_message,
						className: "sm:col-span-2",
					},
			  ]
			: []),
	];
	const selectDetailItems = (labels: string[]) =>
		labels.flatMap((label) => {
			const item = requestDetailItems.find((candidate) => candidate.label === label);
			return item ? [item] : [];
		});
	const routingDetailItems = selectDetailItems([
		"Requested model",
		"Routed model",
		"Upstream model ID",
		"Provider",
		"Endpoint",
		"App where used",
	]);
	const trainingPolicyItem = requestDetailItems.find((item) => item.label === "Data policy");
	const dataPolicyItems = [
		...(trainingPolicyItem
			? [{
				...trainingPolicyItem,
				label: "Data training",
				description: "Whether the upstream provider may use prompts or completions for model training.",
			}]
			: []),
		{
			label: "Phaseo data retention",
			description: "Whether Phaseo retained the gateway request and response payload for this generation.",
			value: (
				<span className="inline-flex items-center justify-end gap-2">
					<Database className="size-3.5 shrink-0 text-muted-foreground" />
					{ioLog?.retention_until
						? `Retained Until ${formatWordyDateTime(ioLog.retention_until)}`
						: "No Retained Payload"}
				</span>
			),
		},
	];
	const technicalDetailItems = selectDetailItems([
		"Request ID",
		"Native request ID",
		"Session ID",
		"Streaming",
		"Status code",
		"Finish reason",
		"Error code",
		"Error message",
	]);
	const requestMetadata = request.detail_metadata && typeof request.detail_metadata === "object" && !Array.isArray(request.detail_metadata)
		? request.detail_metadata as Record<string, any>
		: null;
	const rawUserAgent = typeof request.user_agent === "string"
		? request.user_agent
		: typeof requestMetadata?.request?.user_agent === "string"
			? requestMetadata.request.user_agent
			: null;
	technicalDetailItems.push(
		{
			label: "Client",
			value: (
				<span className="inline-flex items-center justify-end gap-2">
					<ClientSourceIcon kind={request.client_source_kind ?? "api"} />
					{request.client_source_name ?? request.client_source_id ?? "Direct HTTP"}
				</span>
			),
		},
		...(request.client_source_version ? [{ label: "Client version", value: request.client_source_version }] : []),
		...(request.client_source_kind ? [{ label: "Client type", value: request.client_source_kind.replace(/_/g, " ") }] : []),
		...(request.client_source_detection ? [{ label: "Detected from", value: request.client_source_detection.replace(/_/g, " ") }] : []),
		...(rawUserAgent ? [{ label: "User agent", value: <code className="font-mono text-[11px]">{rawUserAgent}</code> }] : []),
	);

	const detailContent = (
		<>
				<RequestHeader request={request} headerNavigation={headerNavigation} />
				{loading ? (
					<div className="flex items-center gap-2 border-b border-border/70 px-5 py-2 text-xs text-muted-foreground sm:px-6">
						<LoaderCircle className="size-3.5 animate-spin" />
						Fetching full generation log…
					</div>
				) : null}
				{headerActions ? (
					<div className="border-b bg-muted/20 px-5 py-2 sm:px-6">
						{headerActions}
					</div>
				) : null}

				<ScrollArea
					className={cn(
						presentation === "sheet"
							? "min-h-0 flex-1"
							: "max-h-[calc(90vh-110px)]",
					)}
					viewportClassName="px-5 py-3 sm:px-6"
				>
					<div>
						{!request.success && (request.error_code || request.error_message) ? (
							<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm">
								<div className="mb-2 flex items-center gap-2 font-medium text-rose-900">
									<XCircle className="h-4 w-4" />
									Error details
								</div>
								<div className="space-y-1 text-rose-900/90">
									{request.error_code ? (
										<div>
											<span className="font-medium">Code:</span>{" "}
											<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
												{request.error_code}
											</code>
										</div>
									) : null}
									{request.error_message ? (
										<div>
											<span className="font-medium">Message:</span>{" "}
											{formattedGatewayError?.message ?? request.error_message}
										</div>
									) : null}
								</div>
								{formattedGatewayError?.hint ? (
									<div className="mt-3 rounded-xl border border-rose-300/60 bg-white/50 p-3 text-rose-950">
										<div className="mb-1 font-medium">Hint:</div>
										<div>{formattedGatewayError.hint}</div>
									</div>
								) : null}
								{formattedGatewayError?.generationId ? (
									<div className="mt-3 flex items-center gap-2 text-rose-950/90">
										<span className="font-medium">Generation ID:</span>
										<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
											{formattedGatewayError.generationId}
										</code>
										<CopyButton
											size="sm"
											variant="ghost"
											className="text-rose-900/80 hover:text-rose-950"
											content={formattedGatewayError.generationId}
											aria-label="Copy generation id"
										/>
									</div>
								) : null}
								{formattedGatewayError?.reason ||
								formattedGatewayError?.attemptCount != null ||
								failedProviders.length > 0 ||
								failedStatuses.length > 0 ? (
									<div className="mt-3 rounded-xl border border-rose-300/60 bg-white/50 p-3 text-rose-950">
										<div className="mb-2 font-medium">Routing failure summary</div>
										<div className="space-y-1 text-sm">
											{formattedGatewayError?.reason ? (
												<div>
													<span className="font-medium">Reason:</span>{" "}
													<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
														{formattedGatewayError.reason}
													</code>
													<span className="ml-2 text-rose-950/80">
														{formatDiagnosticLabel(formattedGatewayError.reason)}
													</span>
												</div>
											) : null}
											{formattedGatewayError?.attemptCount != null ? (
												<div>
													<span className="font-medium">Attempts:</span>{" "}
													{formattedGatewayError.attemptCount}
												</div>
											) : null}
											{failedProviders.length > 0 ? (
												<div>
													<span className="font-medium">Failed providers:</span>{" "}
													{failedProviders.join(", ")}
												</div>
											) : null}
											{failedStatuses.length > 0 ? (
												<div>
													<span className="font-medium">Failed statuses:</span>{" "}
													{failedStatuses.join(", ")}
												</div>
											) : null}
										</div>
									</div>
								) : null}
								{formattedGatewayError?.providerFailureCategory ||
								formattedGatewayError?.providerFailureProvider ? (
									<div className="mt-3 rounded-xl border border-rose-300/60 bg-white/50 p-3 text-rose-950">
										<div className="mb-2 font-medium">Provider diagnostics</div>
										<div className="space-y-1 text-sm">
											{formattedGatewayError.providerFailureCategory ? (
												<div>
													<span className="font-medium">Category:</span>{" "}
													<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
														{formattedGatewayError.providerFailureCategory}
													</code>
													<span className="ml-2 text-rose-950/80">
														{formatDiagnosticLabel(
															formattedGatewayError.providerFailureCategory
														)}
													</span>
												</div>
											) : null}
											{formattedGatewayError.providerFailureProvider ? (
												<div className="flex items-center gap-2">
													<span className="font-medium">Provider:</span>
													<Logo
														id={formattedGatewayError.providerFailureProvider}
														width={14}
														height={14}
														className="flex-shrink-0"
													/>
													<span>
														{providerNames?.get(
															formattedGatewayError.providerFailureProvider
														) ??
															formattedGatewayError.providerFailureProvider}
													</span>
												</div>
											) : null}
										</div>
									</div>
								) : null}
								{formattedGatewayError?.upstreamError ? (
									<div className="mt-3 rounded-xl border border-rose-300/60 bg-white/50 p-3 text-rose-950">
										<div className="mb-2 font-medium">Upstream error</div>
										<div className="space-y-1 text-sm">
											{formattedGatewayError.upstreamError.code ? (
												<div>
													<span className="font-medium">Code:</span>{" "}
													<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
														{formattedGatewayError.upstreamError.code}
													</code>
												</div>
											) : null}
											{formattedGatewayError.upstreamError.message ? (
												<div>
													<span className="font-medium">Message:</span>{" "}
													{formattedGatewayError.upstreamError.message}
												</div>
											) : null}
											{formattedGatewayError.upstreamError.description ? (
												<div>
													<span className="font-medium">Detail:</span>{" "}
													{formattedGatewayError.upstreamError.description}
												</div>
											) : null}
											{formattedGatewayError.upstreamError.param ? (
												<div>
													<span className="font-medium">Param:</span>{" "}
													<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
														{formattedGatewayError.upstreamError.param}
													</code>
												</div>
											) : null}
										</div>
									</div>
								) : null}
								{formattedFailureSample.length > 0 ? (
									<div className="mt-3 rounded-xl border border-rose-300/60 bg-white/50 p-3 text-rose-950">
										<div className="mb-2 font-medium">Failure sample</div>
										<div className="space-y-2">
											{formattedFailureSample.map((sample, index) => (
												<div
													key={`${sample.provider ?? "unknown"}-${sample.status ?? "na"}-${index}`}
													className="rounded-lg border border-rose-200/70 bg-white/70 p-3 text-sm"
												>
													<div className="flex flex-wrap items-center gap-2">
														<span className="font-medium">
															{sample.provider
																? providerNames?.get(sample.provider) ??
																	sample.provider
																: "Unknown provider"}
														</span>
														{sample.status != null ? (
															<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
																HTTP {sample.status}
															</code>
														) : null}
														{sample.upstreamErrorCode ? (
															<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
																{sample.upstreamErrorCode}
															</code>
														) : null}
													</div>
													{sample.upstreamErrorMessage ? (
														<div className="mt-2">
															<span className="font-medium">Message:</span>{" "}
															{sample.upstreamErrorMessage}
														</div>
													) : null}
													{sample.upstreamErrorDescription &&
													sample.upstreamErrorDescription !==
														sample.upstreamErrorMessage ? (
														<div className="mt-1 text-rose-950/80">
															<span className="font-medium">Detail:</span>{" "}
															{sample.upstreamErrorDescription}
														</div>
													) : null}
												</div>
											))}
										</div>
									</div>
								) : null}
								{providerCandidateDiagnostics ? (
									<div className="mt-3 rounded-xl border border-rose-300/60 bg-white/50 p-3 text-rose-950">
										<div className="mb-2 font-medium">Provider candidates</div>
										<div className="grid gap-2 sm:grid-cols-3">
											<div>
												<div className="text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Known
												</div>
												<div className="font-mono text-sm">
													{providerCandidateDiagnostics.totalProviders ?? "-"}
												</div>
											</div>
											<div>
												<div className="text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Supports endpoint
												</div>
												<div className="font-mono text-sm">
													{providerCandidateDiagnostics.supportsEndpointCount ?? "-"}
												</div>
											</div>
											<div>
												<div className="text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Candidates
												</div>
												<div className="font-mono text-sm">
													{providerCandidateDiagnostics.candidateCount ?? "-"}
												</div>
											</div>
										</div>
										{providerCandidateDiagnostics.droppedUnsupportedEndpoint.length >
										0 ? (
											<div className="mt-3">
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Unsupported endpoints
												</div>
												<div className="flex flex-wrap gap-2">
													{providerCandidateDiagnostics.droppedUnsupportedEndpoint.map(
														(endpoint) => (
															<code
																key={endpoint}
																className="rounded bg-rose-100 px-1.5 py-0.5 text-xs"
															>
																{endpoint}
															</code>
														)
													)}
												</div>
											</div>
										) : null}
										{providerCandidateDiagnostics.droppedMissingAdapter.length > 0 ? (
											<div className="mt-3 space-y-2">
												<div className="text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Missing adapters
												</div>
												{providerCandidateDiagnostics.droppedMissingAdapter.map(
													(entry, index) => (
														<div
															key={`${entry.providerId ?? "unknown"}-${entry.endpoint ?? "unknown"}-${index}`}
															className="rounded-lg border border-rose-200/70 bg-white/70 p-2 text-sm"
														>
															<span className="font-medium">
																{entry.providerId
																	? providerNames?.get(entry.providerId) ??
																		entry.providerId
																	: "Unknown provider"}
															</span>
															{entry.endpoint ? (
																<>
																	{" "}
																	for{" "}
																	<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
																		{entry.endpoint}
																	</code>
																</>
															) : null}
														</div>
													)
												)}
											</div>
										) : null}
									</div>
								) : null}
								{providerEnablement ? (
									<div className="mt-3 rounded-xl border border-rose-300/60 bg-white/50 p-3 text-rose-950">
										<div className="mb-2 font-medium">Provider enablement</div>
										{providerEnablement.capability ? (
											<div className="mb-2">
												<span className="font-medium">Capability:</span>{" "}
												<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
													{providerEnablement.capability}
												</code>
											</div>
										) : null}
										<div className="grid gap-3 sm:grid-cols-2">
											<div>
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Before
												</div>
												<div className="flex flex-wrap gap-2">
													{providerEnablement.providersBefore.length > 0 ? (
														providerEnablement.providersBefore.map((providerId) => (
															<code
																key={providerId}
																className="rounded bg-rose-100 px-1.5 py-0.5 text-xs"
															>
																{providerNames?.get(providerId) ?? providerId}
															</code>
														))
													) : (
														<span className="text-sm text-rose-950/70">-</span>
													)}
												</div>
											</div>
											<div>
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													After
												</div>
												<div className="flex flex-wrap gap-2">
													{providerEnablement.providersAfter.length > 0 ? (
														providerEnablement.providersAfter.map((providerId) => (
															<code
																key={providerId}
																className="rounded bg-rose-100 px-1.5 py-0.5 text-xs"
															>
																{providerNames?.get(providerId) ?? providerId}
															</code>
														))
													) : (
														<span className="text-sm text-rose-950/70">-</span>
													)}
												</div>
											</div>
										</div>
										{providerEnablement.dropped.length > 0 ? (
											<div className="mt-3 space-y-2">
												<div className="text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Dropped providers
												</div>
												{providerEnablement.dropped.map((entry, index) => (
													<div
														key={`${entry.providerId ?? "unknown"}-${entry.reason ?? "unknown"}-${index}`}
														className="rounded-lg border border-rose-200/70 bg-white/70 p-2 text-sm"
													>
														<div className="font-medium">
															{entry.providerId
																? providerNames?.get(entry.providerId) ??
																	entry.providerId
																: "Unknown provider"}
														</div>
														{entry.reason ? (
															<div className="mt-1 text-rose-950/80">
																<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
																	{entry.reason}
																</code>
																<span className="ml-2">
																	{formatDiagnosticLabel(entry.reason)}
																</span>
															</div>
														) : null}
													</div>
												))}
											</div>
										) : null}
									</div>
								) : null}
								{workspacePolicyDiagnostics ? (
									<div className="mt-3 rounded-xl border border-rose-300/60 bg-white/50 p-3 text-rose-950">
										<div className="mb-2 font-medium">Workspace policy</div>
										<div className="grid gap-2 sm:grid-cols-2">
											<div>
												<span className="font-medium">Resolved model:</span>{" "}
												{workspacePolicyDiagnostics.resolvedModel ? (
													<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
														{workspacePolicyDiagnostics.resolvedModel}
													</code>
												) : (
													<span className="text-rose-950/70">-</span>
												)}
											</div>
											<div>
												<span className="font-medium">Candidate count:</span>{" "}
												<span className="font-mono text-sm">
													{workspacePolicyDiagnostics.beforeCount ?? "-"} →{" "}
													{workspacePolicyDiagnostics.afterCount ?? "-"}
												</span>
											</div>
										</div>
										<div className="mt-3 grid gap-3 sm:grid-cols-2">
											<div>
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Active guardrails
												</div>
												<div className="flex flex-wrap gap-2">
													{workspacePolicyDiagnostics.activeGuardrailIds.length > 0 ? (
														workspacePolicyDiagnostics.activeGuardrailIds.map(
															(guardrailId) => renderCodeBadge(guardrailId),
														)
													) : (
														<span className="text-sm text-rose-950/70">-</span>
													)}
												</div>
											</div>
											<div>
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Allowed models
												</div>
												<div className="flex flex-wrap gap-2">
													{workspacePolicyDiagnostics.allowedApiModels.length > 0 ? (
														workspacePolicyDiagnostics.allowedApiModels.map(
															(modelId) => renderCodeBadge(modelId),
														)
													) : (
														<span className="text-sm text-rose-950/70">All models</span>
													)}
												</div>
											</div>
											<div>
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Provider allowlist
												</div>
												<div className="flex flex-wrap gap-2">
													{workspacePolicyDiagnostics.providerAllowlist.length > 0 ? (
														workspacePolicyDiagnostics.providerAllowlist.map(
															(providerId) =>
																renderProviderBadge(providerId, providerNames),
														)
													) : (
														<span className="text-sm text-rose-950/70">All providers</span>
													)}
												</div>
											</div>
											<div>
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Provider blocklist
												</div>
												<div className="flex flex-wrap gap-2">
													{workspacePolicyDiagnostics.providerBlocklist.length > 0 ? (
														workspacePolicyDiagnostics.providerBlocklist.map(
															(providerId) =>
																renderProviderBadge(providerId, providerNames),
														)
													) : (
														<span className="text-sm text-rose-950/70">-</span>
													)}
												</div>
											</div>
											<div>
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Request provider only
												</div>
												<div className="flex flex-wrap gap-2">
													{workspacePolicyDiagnostics.requestProviderOnly.length > 0 ? (
														workspacePolicyDiagnostics.requestProviderOnly.map(
															(providerId) =>
																renderProviderBadge(providerId, providerNames),
														)
													) : (
														<span className="text-sm text-rose-950/70">-</span>
													)}
												</div>
											</div>
											<div>
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Request provider ignore
												</div>
												<div className="flex flex-wrap gap-2">
													{workspacePolicyDiagnostics.requestProviderIgnore.length > 0 ? (
														workspacePolicyDiagnostics.requestProviderIgnore.map(
															(providerId) =>
																renderProviderBadge(providerId, providerNames),
														)
													) : (
														<span className="text-sm text-rose-950/70">-</span>
													)}
												</div>
											</div>
										</div>
									</div>
								) : null}
								{routingDiagnostics &&
								(routingDiagnostics.filterStages.length > 0 ||
									consideredProviders.length > 0 ||
									rankedProviders.length > 0) ? (
									<div className="mt-3 rounded-xl border border-rose-300/60 bg-white/50 p-3 text-rose-950">
										<div className="mb-2 font-medium">Routing diagnostics</div>
										{consideredProviders.length > 0 ? (
											<div className="mb-3">
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Providers considered
												</div>
												<div className="flex flex-wrap gap-2">
													{consideredProviders.map((provider, index) => (
														<div
															key={`${provider.providerId ?? "provider"}-${index}`}
															className="rounded border border-rose-200/70 bg-white/80 px-2 py-1 text-xs"
														>
															<div className="font-medium">
																{provider.providerId
																	? providerNames?.get(provider.providerId) ??
																		provider.providerId
																	: "Unknown provider"}
															</div>
															<div className="text-rose-950/80">
																{[
																	provider.providerStatus,
																	provider.providerRoutingStatus,
																	provider.modelRoutingStatus,
																	provider.capabilityStatus,
																]
																	.filter(Boolean)
																	.map((value) => formatDiagnosticLabel(value!))
																	.join(" • ")}
															</div>
														</div>
													))}
												</div>
											</div>
										) : null}
										{rankedProviders.length > 0 ? (
											<div className="mb-3">
												<div className="mb-1 text-xs font-medium uppercase tracking-wide text-rose-950/70">
													Ranked providers
												</div>
												<div className="space-y-2">
													{rankedProviders.slice(0, 5).map((provider, index) => (
														<div
															key={`${provider.providerId ?? "ranked"}-${index}`}
															className="rounded-lg border border-rose-200/70 bg-white/80 p-2 text-sm"
														>
															<div className="flex flex-wrap items-center justify-between gap-2">
																<div className="font-medium">
																	{provider.providerId
																		? providerNames?.get(provider.providerId) ??
																			provider.providerId
																		: "Unknown provider"}
																</div>
																<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
																	score {formatScoreValue(provider.score)}
																</code>
															</div>
															{provider.apiModelId || provider.providerModelSlug ? (
																<div className="mt-2 flex flex-wrap gap-1">
																	{provider.apiModelId ? (
																		<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
																			{provider.apiModelId}
																		</code>
																	) : null}
																	{provider.providerModelSlug ? (
																		<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
																			{provider.providerModelSlug}
																		</code>
																	) : null}
																</div>
															) : null}
															<div className="mt-2 flex flex-wrap gap-2 text-xs text-rose-950/80">
																<code className="rounded bg-rose-100 px-1.5 py-0.5">
																	success {formatScoreValue(provider.scoreFactors.successRate)}
																</code>
																<code className="rounded bg-rose-100 px-1.5 py-0.5">
																	latency {formatScoreValue(provider.scoreFactors.latencyScore)}
																</code>
																<code className="rounded bg-rose-100 px-1.5 py-0.5">
																	tail {formatScoreValue(provider.scoreFactors.tailLatencyScore)}
																</code>
																<code className="rounded bg-rose-100 px-1.5 py-0.5">
																	throughput {formatScoreValue(provider.scoreFactors.throughputScore)}
																</code>
																<code className="rounded bg-rose-100 px-1.5 py-0.5">
																	price {formatScoreValue(provider.scoreFactors.priceScore)}
																</code>
																<code className="rounded bg-rose-100 px-1.5 py-0.5">
																	token fit {formatScoreValue(provider.scoreFactors.tokenAffinity)}
																</code>
																{provider.scoreFactors.cacheBoostMultiplier != null &&
																provider.scoreFactors.cacheBoostMultiplier > 1 ? (
																	<code className="rounded bg-rose-100 px-1.5 py-0.5">
																		cache boost {formatScoreValue(provider.scoreFactors.cacheBoostMultiplier)}
																	</code>
																) : null}
																{provider.breaker ? (
																	<code className="rounded bg-rose-100 px-1.5 py-0.5">
																		breaker {provider.breaker}
																	</code>
																) : null}
															</div>
														</div>
													))}
												</div>
											</div>
										) : null}
										<div className="space-y-3">
											{routingDiagnostics.filterStages.map((stage, index) => (
												<div
													key={`${stage.stage ?? "stage"}-${index}`}
													className="rounded-lg border border-rose-200/70 bg-white/70 p-3 text-sm"
												>
													<div className="flex flex-wrap items-center gap-2">
														<span className="font-medium">
															{stage.stage
																? formatDiagnosticLabel(stage.stage)
																: `Stage ${index + 1}`}
														</span>
														{stage.beforeCount != null ? (
															<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
																before {stage.beforeCount}
															</code>
														) : null}
														{stage.afterCount != null ? (
															<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
																after {stage.afterCount}
															</code>
														) : null}
													</div>
													{stage.droppedProviders.length > 0 ? (
														<div className="mt-2 space-y-2">
															{stage.droppedProviders.map((entry, entryIndex) => (
																<div
																	key={`${entry.providerId ?? "unknown"}-${entry.reason ?? "unknown"}-${entryIndex}`}
																	className="rounded border border-rose-200/70 bg-white/80 p-2"
																>
																	<div className="font-medium">
																		{entry.providerId
																			? providerNames?.get(entry.providerId) ??
																				entry.providerId
																			: "Unknown provider"}
																	</div>
																	{entry.reason ? (
																		<div className="mt-1 text-rose-950/80">
																			<code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs">
																				{entry.reason}
																			</code>
																			<span className="ml-2">
																				{formatDiagnosticLabel(entry.reason)}
																			</span>
																		</div>
																	) : null}
																</div>
															))}
														</div>
													) : null}
												</div>
											))}
										</div>
									</div>
								) : null}
							</div>
						) : null}

						{guardrailEnforcement ? (
							<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
								<div className="mb-2 flex flex-wrap items-center gap-2 font-medium">
									<Info className="h-4 w-4" />
									Guardrail enforcement
								</div>
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="space-y-1">
										{guardrailEnforcement.action ? (
											<div>
												<span className="font-medium">Action:</span>{" "}
												<code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">
													{guardrailEnforcement.action}
												</code>
											</div>
										) : null}
										{guardrailEnforcement.source ? (
											<div>
												<span className="font-medium">Source:</span>{" "}
												{formatDiagnosticLabel(guardrailEnforcement.source)}
											</div>
										) : null}
										{guardrailEnforcement.detectionCount != null ? (
											<div>
												<span className="font-medium">Detections:</span>{" "}
												{guardrailEnforcement.detectionCount}
											</div>
										) : null}
										{guardrailEnforcement.redactionCount != null ? (
											<div>
												<span className="font-medium">Redactions:</span>{" "}
												{guardrailEnforcement.redactionCount}
											</div>
										) : null}
									</div>
									<div>
										<div className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-950/70">
											Guardrails
										</div>
										<div className="flex flex-wrap gap-2">
											{guardrailEnforcement.guardrailIds.length > 0 ? (
												guardrailEnforcement.guardrailIds.map((guardrailId) => (
													<code
														key={guardrailId}
														className="rounded bg-amber-100 px-1.5 py-0.5 text-xs"
													>
														{guardrailId}
													</code>
												))
											) : (
												<span className="text-amber-950/70">-</span>
											)}
										</div>
									</div>
								</div>
								{guardrailEnforcement.detectors.length > 0 ? (
									<div className="mt-3 space-y-2">
										<div className="text-xs font-medium uppercase tracking-wide text-amber-950/70">
											Detectors
										</div>
										{guardrailEnforcement.detectors.map((detector, index) => (
											<div
												key={`${detector.detectorId ?? "detector"}-${index}`}
												className="rounded-lg border border-amber-200/70 bg-white/70 p-2"
											>
												<div className="font-medium">
													{detector.detectorId
														? formatDiagnosticLabel(detector.detectorId)
														: `Detector ${index + 1}`}
												</div>
												<div className="mt-1 text-amber-950/80">
													{[detector.category, detector.variant]
														.filter(Boolean)
														.map((value) => formatDiagnosticLabel(value!))
														.join(" • ")}
												</div>
											</div>
										))}
									</div>
								) : null}
							</div>
						) : null}

						{pluginExecutions.length > 0 ? (
							<div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
								<div className="mb-2 flex items-center gap-2 font-medium">
									<Info className="h-4 w-4" />
									Plugin execution
								</div>
								<div className="space-y-3">
									{pluginExecutions.map((execution, index) => (
										<div
											key={`${execution.id}-${index}`}
											className="rounded-xl border border-violet-200/80 bg-white/80 p-3"
										>
											<div className="flex flex-wrap items-center gap-2">
												<code className="rounded bg-violet-100 px-1.5 py-0.5 text-xs">
													{execution.id}
												</code>
												{execution.status ? (
													<code className="rounded bg-violet-100 px-1.5 py-0.5 text-xs">
														{execution.status}
													</code>
												) : null}
												{execution.stage ? (
													<span className="text-violet-950/75">
														{formatDiagnosticLabel(
															execution.stage.replaceAll(".", "_"),
														)}
													</span>
												) : null}
											</div>
											<div className="mt-2 grid gap-2 sm:grid-cols-2">
												<div>
													<span className="font-medium">Changed:</span>{" "}
													{execution.changed ? "Yes" : "No"}
												</div>
												{execution.attempted != null ? (
													<div>
														<span className="font-medium">Attempted:</span>{" "}
														{execution.attempted ? "Yes" : "No"}
													</div>
												) : null}
												{execution.healed != null ? (
													<div>
														<span className="font-medium">Healed:</span>{" "}
														{execution.healed ? "Yes" : "No"}
													</div>
												) : null}
												{execution.mode ? (
													<div>
														<span className="font-medium">Mode:</span>{" "}
														{formatDiagnosticLabel(execution.mode)}
													</div>
												) : null}
												{execution.failureReason ? (
													<div>
														<span className="font-medium">Failure reason:</span>{" "}
													{formatDiagnosticLabel(execution.failureReason)}
												</div>
											) : null}
												{execution.reason ? (
													<div>
														<span className="font-medium">
															{execution.status === "failed"
																? "Execution reason:"
																: "Skip reason:"}
														</span>{" "}
														{formatDiagnosticLabel(execution.reason)}
													</div>
												) : null}
												{execution.errorMessage ? (
													<div className="sm:col-span-2">
														<span className="font-medium">Error:</span>{" "}
														<span className="break-words text-violet-950/90">
															{execution.errorMessage}
														</span>
													</div>
												) : null}
											</div>
											{execution.transformsApplied.length > 0 ? (
												<div className="mt-3">
													<div className="mb-1 text-xs font-medium uppercase tracking-wide text-violet-950/70">
														Transforms applied
													</div>
													<div className="flex flex-wrap gap-2">
														{execution.transformsApplied.map((transform) => (
															<code
																key={transform}
																className="rounded bg-violet-100 px-1.5 py-0.5 text-xs"
															>
																{transform}
															</code>
														))}
													</div>
												</div>
											) : null}
											{execution.validationErrors.length > 0 ? (
												<div className="mt-3">
													<div className="mb-1 text-xs font-medium uppercase tracking-wide text-violet-950/70">
														Validation errors
													</div>
													<div className="space-y-1">
														{execution.validationErrors.map((error, errorIndex) => (
															<div
																key={`${execution.id}-validation-${errorIndex}`}
																className="rounded bg-violet-100/70 px-2 py-1 text-xs text-violet-950/90"
															>
																{error}
															</div>
														))}
													</div>
												</div>
											) : null}
										</div>
									))}
								</div>
							</div>
						) : null}

						{searchObservability ? (
							<div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950">
								<div className="mb-2 flex items-center gap-2 font-medium">
									<Info className="h-4 w-4" />
									Web search observability
								</div>
								<div className="grid gap-2 sm:grid-cols-4">
									<div>
										<span className="font-medium">Native search:</span>{" "}
										{searchObservability.usedNativeWebSearch ? "Yes" : "No"}
									</div>
									<div>
										<span className="font-medium">Managed search:</span>{" "}
										{searchObservability.usedManagedWebSearch ? "Yes" : "No"}
									</div>
									<div>
										<span className="font-medium">Results:</span>{" "}
										{searchObservability.resultCount}
									</div>
									<div>
										<span className="font-medium">Citations:</span>{" "}
										{searchObservability.citationCount}
									</div>
								</div>
								{searchObservability.nativeSearches.length > 0 ? (
									<div className="mt-3 space-y-2">
										<div className="text-xs font-medium uppercase tracking-wide text-cyan-950/70">
											Native searches
										</div>
										{searchObservability.nativeSearches.map((search, index) => (
											<div
												key={`${search.type ?? "native-search"}-${search.query ?? index}-${index}`}
												className="rounded-lg border border-cyan-200/80 bg-white/80 p-3"
											>
												<div className="flex flex-wrap items-center gap-2">
													<span className="font-medium">
														{search.query ?? `Search ${index + 1}`}
													</span>
													{search.type ? (
														<code className="rounded bg-cyan-100 px-1.5 py-0.5 text-xs">
															{search.type}
														</code>
													) : null}
													{search.status ? (
														<code className="rounded bg-cyan-100 px-1.5 py-0.5 text-xs">
															{search.status}
														</code>
													) : null}
												</div>
											</div>
										))}
									</div>
								) : null}
								{searchObservability.managedSearches.length > 0 ? (
									<div className="mt-3 space-y-2">
										<div className="text-xs font-medium uppercase tracking-wide text-cyan-950/70">
											Managed searches
										</div>
										{searchObservability.managedSearches.map((search, index) => (
											<div
												key={`${search.requestId ?? search.query ?? "managed-search"}-${index}`}
												className="rounded-lg border border-cyan-200/80 bg-white/80 p-3"
											>
												<div className="flex flex-wrap items-center gap-2">
													<span className="font-medium">
														{search.query ?? `Search ${index + 1}`}
													</span>
													{search.provider ? (
														<code className="rounded bg-cyan-100 px-1.5 py-0.5 text-xs">
															{search.provider}
														</code>
													) : null}
													{search.searchType ? (
														<code className="rounded bg-cyan-100 px-1.5 py-0.5 text-xs">
															{search.searchType}
														</code>
													) : null}
												</div>
												<div className="mt-1 text-cyan-950/85">
													{search.resultCount} result
													{search.resultCount === 1 ? "" : "s"}
													{search.requestId ? ` | ${search.requestId}` : ""}
												</div>
											</div>
										))}
									</div>
								) : null}
								{searchObservability.results.length > 0 ? (
									<div className="mt-3 space-y-2">
										<div className="text-xs font-medium uppercase tracking-wide text-cyan-950/70">
											Search results
										</div>
										{searchObservability.results.map((result, index) => (
											<div
												key={`${result.url ?? result.title ?? "search-result"}-${index}`}
												className="rounded-lg border border-cyan-200/80 bg-white/80 p-3"
											>
												<div className="flex flex-wrap items-center gap-2">
													{result.title ? (
														<span className="font-medium">{result.title}</span>
													) : (
														<span className="font-medium">Result {index + 1}</span>
													)}
													{result.type ? (
														<code className="rounded bg-cyan-100 px-1.5 py-0.5 text-xs">
															{result.type}
														</code>
													) : null}
												</div>
												{result.url ? (
													<div className="mt-1 break-all text-cyan-950/80">
														<a
															href={result.url}
															target="_blank"
															rel="noreferrer"
															className="underline decoration-transparent transition-colors duration-200 hover:text-cyan-700 hover:decoration-current"
														>
															{result.url}
														</a>
													</div>
												) : null}
												{result.snippet ? (
													<div className="mt-2 text-cyan-950/85">
														{result.snippet}
													</div>
												) : null}
											</div>
										))}
									</div>
								) : null}
								{searchObservability.citations.length > 0 ? (
									<div className="mt-3 space-y-2">
										<div className="text-xs font-medium uppercase tracking-wide text-cyan-950/70">
											Citations
										</div>
										{searchObservability.citations.map((citation, index) => (
											<div
												key={`${citation.url ?? citation.title ?? "citation"}-${index}`}
												className="rounded-lg border border-cyan-200/80 bg-white/80 p-3"
											>
												<div className="flex flex-wrap items-center gap-2">
													<span className="font-medium">
														{citation.title ?? `Citation ${index + 1}`}
													</span>
													{citation.type ? (
														<code className="rounded bg-cyan-100 px-1.5 py-0.5 text-xs">
															{citation.type}
														</code>
													) : null}
												</div>
												{citation.url ? (
													<div className="mt-1 break-all text-cyan-950/80">
														<a
															href={citation.url}
															target="_blank"
															rel="noreferrer"
															className="underline decoration-transparent transition-colors duration-200 hover:text-cyan-700 hover:decoration-current"
														>
															{citation.url}
														</a>
													</div>
												) : null}
												{citation.text ? (
													<div className="mt-2 text-cyan-950/85">
														{citation.text}
													</div>
												) : null}
											</div>
										))}
									</div>
								) : null}
							</div>
						) : null}

						{webFetchObservability ? (
							<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
								<div className="mb-2 flex items-center gap-2 font-medium">
									<Info className="h-4 w-4" />
									Web fetch observability
								</div>
								<div className="grid gap-2 sm:grid-cols-2">
									<div>
										<span className="font-medium">Fetches:</span>{" "}
										{webFetchObservability.requestCount}
									</div>
									<div>
										<span className="font-medium">Truncated:</span>{" "}
										{
											webFetchObservability.fetches.filter((entry) => entry.truncated)
												.length
										}
									</div>
								</div>
								<div className="mt-3 space-y-2">
									<div className="text-xs font-medium uppercase tracking-wide text-amber-950/70">
										Fetched pages
									</div>
									{webFetchObservability.fetches.map((entry, index) => (
										<div
											key={`${entry.finalUrl ?? entry.url ?? "fetch"}-${index}`}
											className="rounded-lg border border-amber-200/80 bg-white/80 p-3"
										>
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-medium">
													{entry.title ?? `Fetch ${index + 1}`}
												</span>
												{entry.provider ? (
													<code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">
														{entry.provider}
													</code>
												) : null}
												{entry.status !== null ? (
													<code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">
														HTTP {entry.status}
													</code>
												) : null}
												{entry.contentType ? (
													<code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">
														{entry.contentType}
													</code>
												) : null}
											</div>
											{entry.finalUrl ?? entry.url ? (
												<div className="mt-1 break-all text-amber-950/80">
													<a
														href={entry.finalUrl ?? entry.url ?? "#"}
														target="_blank"
														rel="noreferrer"
														className="underline decoration-transparent transition-colors duration-200 hover:text-amber-700 hover:decoration-current"
													>
														{entry.finalUrl ?? entry.url}
													</a>
												</div>
											) : null}
											<div className="mt-2 text-amber-950/85">
												{entry.returnedChars.toLocaleString()} chars returned
												{entry.truncated ? " | truncated" : ""}
											</div>
										</div>
									))}
								</div>
							</div>
						) : null}

						<GenerationSection title="Routing details">
							<DetailRows items={routingDetailItems} />
						</GenerationSection>

						<GenerationSection title="Performance">
							<DetailKeyValueGrid
								columns={3}
								items={[
									{ label: "Provider latency", value: <span className="font-mono">{timingLatency > 0 ? `${timingLatency} ms` : "-"}</span> },
									{ label: "Generation time", value: <span className="font-mono">{timingGeneration > 0 ? `${timingGeneration} ms` : "-"}</span> },
									{ label: "Throughput", value: <span className="font-mono">{formatThroughput(request.throughput)}</span> },
									{ label: "Cost", value: <span className="font-mono">{formatCost(request.cost_nanos)}</span> },
									{ label: "Tokens", value: <span className="font-mono">{usageSummary.input != null || usageSummary.output != null ? `${formatUsageNumber(usageSummary.input ?? 0)} → ${formatUsageNumber(usageSummary.output ?? 0)}` : "-"}</span> },
									{ label: "Stop reason", value: request.finish_reason || "-" },
								]}
							/>
						</GenerationSection>

						<GenerationSection title="Provider Responses">
							<DetailTimingBar items={responseTimelineItems} />
							<RoutingTracePanel
								trace={request.routing_trace ?? null}
								decisions={storedRoutingDecisions}
								providerNames={providerNames}
							/>
						</GenerationSection>

						<GenerationSection title="Usage">
							{usageMeters.length > 0 ? (
								<div className="space-y-4">
									{nativeUsageMeters.length > 0 ? <UsageGroup title="Native" meters={nativeUsageMeters} /> : null}
									{internalUsageMeters.length > 0 ? <UsageGroup title="Internal measures" meters={internalUsageMeters} /> : null}
								</div>
							) : (
								<div className="text-sm text-muted-foreground">
									No usage metrics available.
								</div>
							)}
						</GenerationSection>

						<GenerationSection title="Data Policy">
							<DetailRows items={dataPolicyItems} />
						</GenerationSection>

						{ioLog ? (
							<GenerationSection title="Gateway I/O">
								<div className="space-y-4 text-sm">
									<div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
										<span>Status: <span className="font-medium text-foreground">{ioLog.status}</span></span>
										{ioLog.bytes ? <span>{ioLog.bytes.toLocaleString()} bytes</span> : null}
										{ioLog.retention_until ? <span>Retained until {formatWordyDateTime(ioLog.retention_until)}</span> : null}
									</div>
									{ioLog.payload ? (
										<div className="grid gap-4 xl:grid-cols-2">
											<div className="min-w-0"><p className="mb-2 font-medium">Prompt</p><pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-5 whitespace-pre-wrap break-words">{JSON.stringify(ioLog.payload.request_payload ?? ioLog.payload.provider_request ?? null, null, 2)}</pre></div>
											<div className="min-w-0"><p className="mb-2 font-medium">Completion</p><pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-5 whitespace-pre-wrap break-words">{JSON.stringify(ioLog.payload.gateway_response ?? ioLog.payload.provider_response ?? null, null, 2)}</pre></div>
										</div>
									) : <p className="text-muted-foreground">{ioLog.error ?? "No I/O payload is available for this request."}</p>}
								</div>
							</GenerationSection>
						) : null}

						<GenerationSection title="Technical Details">
							<DetailRows items={technicalDetailItems} />
						</GenerationSection>

						{pricingLines.length > 0 ? (
							<GenerationSection title="Pricing">
								<div className="space-y-2">
									{pricingLines.map((line, index) => (
										<div
											key={`request-pricing-line-${index}`}
											className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
										>
											<code className="whitespace-pre-wrap break-words font-mono text-xs">
												{formatRequestPricingLine(line)}
											</code>
										</div>
									))}
								</div>
							</GenerationSection>
						) : null}
					</div>
				</ScrollArea>
		</>
	);

	if (presentation === "sheet") {
		return (
			<ProviderInspectorSheet
				open={open}
				onOpenChange={onOpenChange}
				disablePointerDismissal={disablePointerDismissal}
			>
				<ProviderInspectorSheetContent
					className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[58vw] lg:!w-[54vw] xl:!w-[50vw] 2xl:!w-[46vw] data-[side=right]:sm:max-w-none"
				>
					{detailContent}
				</ProviderInspectorSheetContent>
			</ProviderInspectorSheet>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
				<DialogHeader className="sr-only">
					<DialogTitle>Request details</DialogTitle>
				</DialogHeader>
				{detailContent}
			</DialogContent>
		</Dialog>
	);
}

function GenerationSection({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="border-b border-border/70 py-2 last:border-b-0">
			<h2 className="mb-2 text-sm font-semibold text-foreground">{titleCaseLabel(title)}</h2>
			{children}
		</section>
	);
}

function DetailRows({
	items,
}: {
	items: Array<{ label: string; value: React.ReactNode; description?: string }>;
}) {
	return (
		<div className="space-y-2">
			{items.map((item) => (
				<div
					key={item.label}
					className="grid min-h-6 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4"
				>
					<div className="flex items-center gap-1.5 text-[11px] leading-5 text-muted-foreground">
						<span>{titleCaseLabel(item.label)}</span>
						{item.description ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<button type="button" className="inline-flex shrink-0 text-muted-foreground/70 hover:text-foreground" aria-label={`About ${item.label}`}>
										<Info className="size-3" />
									</button>
								</TooltipTrigger>
								<TooltipContent side="top" className="max-w-64 text-xs">
									{item.description}
								</TooltipContent>
							</Tooltip>
						) : null}
					</div>
					<div className="flex min-w-0 max-w-[18rem] justify-end break-words text-right text-sm font-medium text-foreground [&>div]:min-w-0 [&_code]:break-all">
						{item.value}
					</div>
				</div>
			))}
		</div>
	);
}

function titleCaseLabel(value: string): string {
	return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeValue(value: string): string {
	return titleCaseLabel(value.replace(/[_-]+/g, " "));
}

function humanizeEndpoint(value: string): string {
	return titleCaseLabel(
		value
			.replace(/^\/?v\d+\//i, "")
			.replace(/[._/-]+/g, " ")
			.trim(),
	);
}

function ClientSourceIcon({ kind }: { kind: string }) {
	const className = "size-3.5 shrink-0 text-muted-foreground";
	if (kind === "coding_agent" || kind === "agent_sdk") return <Bot className={className} />;
	if (kind === "sdk") return <Package className={className} />;
	if (kind === "http_client") return <Terminal className={className} />;
	return <Braces className={className} />;
}

function DataPolicyIcon({ policy }: { policy: unknown }) {
	const normalized = normalizeProviderPromptTrainingPolicy(policy);
	const className = "size-3.5 shrink-0 text-muted-foreground";
	if (normalized === "may_train") return <GraduationCap className={className} />;
	if (normalized === "no_train" || normalized === "enterprise_no_train") {
		return <ShieldCheck className={className} />;
	}
	return <ShieldQuestion className={className} />;
}

function CopyableText({ value, ariaLabel }: { value: string; ariaLabel: string }) {
	const [copied, setCopied] = React.useState(false);
	const copy = React.useCallback(() => {
		void navigator.clipboard
			.writeText(value)
			.then(() => {
				setCopied(true);
				window.setTimeout(() => setCopied(false), 1500);
			})
			.catch(() => setCopied(false));
	}, [value]);

	return (
		<button
			type="button"
			onClick={copy}
			className={cn(
				"min-w-0 max-w-full truncate font-mono text-xs underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground",
				copied ? "text-emerald-500" : "text-foreground",
			)}
			title={copied ? "Copied" : "Click to copy"}
			aria-label={ariaLabel}
		>
			{value}
			<span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
		</button>
	);
}

function UsageGroup({ title, meters }: { title: string; meters: UsageMeter[] }) {
	return (
		<div>
			<h3 className="mb-2 text-xs font-medium text-foreground">{title}</h3>
			<DetailRows
				items={meters.map((meter) => ({
					label: meter.label,
					value: <span className="font-mono">{formatUsageNumber(meter.value)}</span>,
				}))}
			/>
		</div>
	);
}
