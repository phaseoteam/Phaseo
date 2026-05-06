"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
	Activity,
	ArrowRight,
	Clock,
	Coins,
	Gauge,
	Hash,
	Info,
	XCircle,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
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
	type ProviderMetadataEntry,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { cn } from "@/lib/utils";
import { extractUsageMeters, formatUsageNumber } from "./usageMeters";
import {
	DetailKeyValueGrid,
	DetailMetricTile,
	DetailSection,
	DetailTimingBar,
} from "./DetailDialogPrimitives";
import { formatWordyDateTime } from "@/lib/gateway/usage/timeFormatting";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";
import {
	PROVIDER_PROMPT_TRAINING_POLICY_LABELS,
	normalizeProviderPromptTrainingPolicy,
} from "@/lib/providers/promptTrainingPolicy";
import { formatRoomError } from "@/lib/chat/formatRoomError";

interface RequestDetailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	request: RequestRow | null;
	appName?: string | null;
	modelMetadata?: ModelMetadataMap;
	providerName?: string | null;
	providerNames?: Map<string, string>;
	providerMetadata?: Map<string, ProviderMetadataEntry>;
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
	next.set("view", args.view);
	if (args.requestId) next.set("req", args.requestId);
	if (args.sessionId) next.set("session", args.sessionId);
	return `/settings/usage/logs?${next.toString()}`;
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
	modelMetadata,
	providerName,
	providerMetadata,
}: {
	request: RequestRow;
	modelMetadata?: ModelMetadataMap;
	providerName?: string | null;
	providerMetadata?: Map<string, ProviderMetadataEntry>;
}) {
	const metadata = modelMetadata ?? new Map();
	const modelHref = getModelDetailsHref(request.model_id);
	const modelName = getModelDisplayName(request.model_id ?? null, metadata);
	const modelMeta = request.model_id ? metadata.get(request.model_id) : undefined;
	const timestamp = formatWordyDateTime(request.created_at, { includeTime: true });
	const providerMeta = request.provider ? providerMetadata?.get(request.provider) : undefined;
	const subtitle = [
		providerName ?? providerMeta?.name ?? request.provider ?? null,
		request.success ? "Success" : "Error",
		timestamp,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div>
			<div className="px-5 py-4 sm:px-6 sm:py-5">
				<div className="pr-10">
					<DialogTitle className="flex min-w-0 items-center gap-3 text-lg font-semibold">
						{modelMeta ? (
							<Logo
								id={modelMeta.organisationId}
								width={20}
								height={20}
								className="flex-shrink-0"
							/>
						) : null}
						{modelHref ? (
							<Link
								href={modelHref}
								className="min-w-0 truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
							>
								{modelName || request.model_id || "Request"}
							</Link>
						) : (
							<span className="min-w-0 truncate">
								{modelName || request.model_id || "Request"}
							</span>
						)}
					</DialogTitle>
					<div className="mt-2 text-sm text-muted-foreground">{subtitle}</div>
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
}: RequestDetailDialogProps) {
	if (!request) return null;

	const searchParams = useSearchParams();
	const metadata = modelMetadata ?? new Map();
	const usageMeters = extractUsageMeters(request.usage);
	const usageSummary = buildUsageSummary(request.usage);
	const timingLatency = Number(request.latency_ms ?? 0) || 0;
	const timingGeneration = Number(request.generation_ms ?? 0) || 0;
	const modelHref = getModelDetailsHref(request.model_id);
	const modelName = getModelDisplayName(request.model_id ?? null, metadata);
	const modelMeta = request.model_id ? metadata.get(request.model_id) : undefined;
	const providerMeta = request.provider ? providerMetadata?.get(request.provider) : undefined;
	const providerPolicyLabel = providerMeta?.promptTrainingPolicy
		? PROVIDER_PROMPT_TRAINING_POLICY_LABELS[
				normalizeProviderPromptTrainingPolicy(providerMeta.promptTrainingPolicy)
			]
		: null;
	const attempts = Array.isArray(request.provider_attempts)
		? request.provider_attempts
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
					const durationMs = Number(attempt.duration_ms ?? 0) || 0;
					const providerRow = {
						key: `provider-${attempt.attempt_number ?? index}`,
						label: (
							<div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
								{attemptProviderId ? (
									<Logo
										id={attemptProviderId}
										width={14}
										height={14}
										className="flex-shrink-0"
									/>
								) : null}
								<span className="min-w-0 break-words">{attemptProviderName}</span>
								{statusDescription ? (
									<Tooltip>
										<TooltipTrigger asChild>
											<span
												className={cn(
													"inline-flex min-w-[38px] flex-shrink-0 items-center justify-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium",
													statusTone.badgeClass,
												)}
											>
												{statusTone.label}
											</span>
										</TooltipTrigger>
										<TooltipContent sideOffset={6} className="max-w-64 text-[11px]">
											{statusDescription}
										</TooltipContent>
									</Tooltip>
								) : (
									<span
										className={cn(
											"inline-flex min-w-[38px] flex-shrink-0 items-center justify-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium",
											statusTone.badgeClass,
										)}
									>
										{statusTone.label}
									</span>
								)}
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
									<div className="flex min-w-0 items-center gap-2 pl-5">
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
										<span className="min-w-0 break-words">
											{providerName ?? request.provider ?? "Provider"}
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
									<div className="flex min-w-0 items-center gap-2 pl-5">
										<span className="min-w-0 break-words">Generation</span>
									</div>
								),
									duration: timingGeneration,
									colorClass: "bg-sky-500",
								},
						  ]
						: []),
			  ];
	const requestFilterHref = request.request_id
		? buildUsageLogsFilterHref({
				searchParams,
				view: "logs",
				requestId: request.request_id,
		  })
		: null;
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
	const formattedFailureSample = formattedGatewayError?.failureSample ?? [];
	const providerCandidateDiagnostics =
		formattedGatewayError?.providerCandidateDiagnostics;
	const providerEnablement = formattedGatewayError?.providerEnablement;
	const routingDiagnostics = formattedGatewayError?.routingDiagnostics;
	const failedProviders = formattedGatewayError?.failedProviders ?? [];
	const failedStatuses = formattedGatewayError?.failedStatuses ?? [];
	const requestDetailItems = [
		{
			label: "Model",
			value: modelHref ? (
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
						className="min-w-0 truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
					>
						{modelName || request.model_id || "-"}
					</Link>
				</div>
			) : (
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
						{modelName || request.model_id || "-"}
					</span>
				</div>
			),
		},
		{
			label: "Req ID",
			value: request.request_id ? (
				<div className="flex items-center gap-2">
					{requestFilterHref ? (
						<Link
							href={requestFilterHref}
							className="min-w-0 truncate font-mono text-xs underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
						>
							{request.request_id}
						</Link>
					) : (
						<code className="min-w-0 truncate font-mono text-xs">
							{request.request_id}
						</code>
					)}
					<CopyButton
						size="sm"
						variant="ghost"
						className="text-muted-foreground hover:text-foreground"
						content={request.request_id}
						aria-label="Copy req id"
					/>
				</div>
			) : (
				"-"
			),
		},
		{
			label: "Native response ID",
			value: request.native_response_id ? (
				<div className="flex items-center gap-2">
					<code className="min-w-0 truncate font-mono text-xs">
						{request.native_response_id}
					</code>
					<CopyButton
						size="sm"
						variant="ghost"
						className="text-muted-foreground hover:text-foreground"
						content={request.native_response_id}
						aria-label="Copy native response id"
					/>
				</div>
			) : (
				"-"
			),
		},
		{
			label: "Upstream request ID",
			value: request.upstream_request_id ? (
				<div className="flex items-center gap-2">
					<code className="min-w-0 truncate font-mono text-xs">
						{request.upstream_request_id}
					</code>
					<CopyButton
						size="sm"
						variant="ghost"
						className="text-muted-foreground hover:text-foreground"
						content={request.upstream_request_id}
						aria-label="Copy upstream request id"
					/>
				</div>
			) : (
				"-"
			),
		},
		{
			label: "Provider",
			value: request.provider ? (
				<Link
					href={`/api-providers/${encodeURIComponent(request.provider)}`}
					className="inline-flex items-center gap-2 underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
				>
					<Logo
						id={request.provider}
						width={16}
						height={16}
						className="flex-shrink-0"
					/>
					<span>{providerName ?? request.provider}</span>
				</Link>
			) : (
				"-"
			),
		},
		{
			label: "Model ID",
			value: request.model_id ? (
				<code className="font-mono text-xs">{request.model_id}</code>
			) : (
				"-"
			),
		},
		{
			label: "Endpoint",
			value: request.endpoint ? (
				<code className="font-mono text-xs">{request.endpoint}</code>
			) : (
				"-"
			),
		},
		{
			label: "Data policy",
			value: providerPolicyLabel ?? "-",
		},
		{
			label: "App where used",
			value:
				request.app_id && appName ? (
					<Link
						href={`/apps/${encodeURIComponent(request.app_id)}`}
						className="underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
					>
						{appName}
					</Link>
				) : (
					appName ?? request.app_id ?? "-"
				),
		},
		{
			label: "Session ID",
			value: request.session_id ? (
				<div className="flex items-center gap-2">
					{sessionFilterHref ? (
						<Link
							href={sessionFilterHref}
							className="min-w-0 truncate font-mono text-xs underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
						>
							{request.session_id}
						</Link>
					) : (
						<code className="min-w-0 truncate font-mono text-xs">
							{request.session_id}
						</code>
					)}
					<CopyButton
						size="sm"
						variant="ghost"
						className="text-muted-foreground hover:text-foreground"
						content={request.session_id}
						aria-label="Copy session id"
					/>
				</div>
			) : (
				"-"
			),
		},
		{
			label: "Finish reason",
			value: request.finish_reason || "-",
		},
		{
			label: "Streaming",
			value: request.stream ? "true" : "false",
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
				<DialogHeader className="sr-only">
					<DialogTitle>Request details</DialogTitle>
				</DialogHeader>

				<RequestHeader
					request={request}
					modelMetadata={modelMetadata}
					providerName={providerName}
					providerMetadata={providerMetadata}
				/>

				<div className="max-h-[calc(90vh-110px)] overflow-y-auto p-5 sm:p-6">
					<div className="space-y-6">
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
								{routingDiagnostics &&
								routingDiagnostics.filterStages.length > 0 ? (
									<div className="mt-3 rounded-xl border border-rose-300/60 bg-white/50 p-3 text-rose-950">
										<div className="mb-2 font-medium">Routing diagnostics</div>
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

						<div className="grid grid-cols-2 gap-2 md:grid-cols-3">
							<DetailMetricTile
								icon={Clock}
								label="Provider latency"
								value={
									timingLatency > 0 ? (
										<span className="font-mono">{timingLatency} ms</span>
									) : (
										"-"
									)
								}
								sub="Time to first token or output byte"
								tone="emerald"
								compact
							/>
							<DetailMetricTile
								icon={Activity}
								label="Generation"
								value={
									timingGeneration > 0 ? (
										<span className="font-mono">{timingGeneration} ms</span>
									) : (
										"-"
									)
								}
								sub="Post-latency generation time"
								tone="sky"
								compact
							/>
							<DetailMetricTile
								icon={Gauge}
								label="Throughput"
								value={<span className="font-mono">{formatThroughput(request.throughput)}</span>}
								tone="violet"
								compact
							/>
							<DetailMetricTile
								icon={Coins}
								label="Cost"
								value={<span className="font-mono">{formatCost(request.cost_nanos)}</span>}
								tone="amber"
								compact
							/>
							<DetailMetricTile
								icon={Hash}
								label="Tokens"
								value={
									usageSummary.input != null || usageSummary.output != null ? (
										<span className="inline-flex items-center gap-1 font-mono">
											{formatUsageNumber(usageSummary.input ?? 0)}
											<ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
											{formatUsageNumber(usageSummary.output ?? 0)}
										</span>
									) : (
										"-"
									)
								}
								sub={
									usageSummary.total != null ? (
										<span>Total {formatUsageNumber(usageSummary.total)}</span>
									) : undefined
								}
								tone="slate"
								compact
							/>
							<DetailMetricTile
								icon={Info}
								label="Stop reason"
								value={request.finish_reason || "-"}
								tone="slate"
								compact
							/>
						</div>

						<DetailSection
							title="Request details"
							className="border-none bg-transparent p-0"
						>
							<DetailKeyValueGrid columns={2} items={requestDetailItems} />
						</DetailSection>

						<DetailSection title="Usage breakdown">
							{usageMeters.length > 0 ? (
								<DetailKeyValueGrid
									columns={3}
									items={usageMeters.map((meter) => ({
										label: meter.label,
										value: formatUsageNumber(meter.value),
									}))}
								/>
							) : (
								<div className="text-sm text-muted-foreground">
									No usage metrics available.
								</div>
							)}
						</DetailSection>

						{request.pricing_lines.length > 0 ? (
							<DetailSection title="Pricing lines">
								<div className="space-y-2">
									{request.pricing_lines.map((line, index) => (
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
							</DetailSection>
						) : null}

						<DetailSection title="Provider response">
							<div className="space-y-4">
								<DetailTimingBar items={responseTimelineItems} />

								{attempts.length > 0 ? (
									<div className="overflow-x-auto rounded-xl border border-border/60">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Attempt</TableHead>
													<TableHead>Provider</TableHead>
													<TableHead>Status</TableHead>
													<TableHead>Outcome</TableHead>
													<TableHead>Duration</TableHead>
													<TableHead>Upstream error</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{attempts.map((attempt, index) => (
													<TableRow
														key={`${attempt.provider ?? "provider"}:${attempt.attempt_number ?? index}`}
													>
														<TableCell>{attempt.attempt_number ?? index + 1}</TableCell>
														<TableCell>{attempt.provider ?? "-"}</TableCell>
														<TableCell>
															{attempt.status != null
																? `${attempt.status}${attempt.status_text ? ` ${attempt.status_text}` : ""}`
																: "-"}
														</TableCell>
														<TableCell>{attempt.outcome ?? "-"}</TableCell>
														<TableCell>{formatDuration(attempt.duration_ms)}</TableCell>
														<TableCell>
															<div className="space-y-1">
																<div>{attempt.upstream_error_code ?? "-"}</div>
																{attempt.upstream_error_message ? (
																	<div className="text-xs text-muted-foreground">
																		{attempt.upstream_error_message}
																	</div>
																) : null}
																{attempt.upstream_error_description &&
																attempt.upstream_error_description !== attempt.upstream_error_message ? (
																	<div className="text-xs text-muted-foreground">
																		{attempt.upstream_error_description}
																	</div>
																) : null}
															</div>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								) : null}
							</div>
						</DetailSection>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
