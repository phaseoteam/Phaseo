"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
        fetchAppMetadata,
	fetchAsyncJobDetail,
	fetchModelMetadata,
	fetchProviderNames,
	fetchRecentAsyncJobs,
	type AppMetadata,
	investigateGeneration,
	type AsyncJobDetailRow,
	type AsyncJobRequestPricingLine,
	type AsyncJobRow,
	type InvestigateGenerationResult,
	type ProviderMetadataEntry,
	type RequestRow,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/ui/copy-button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	AppWindow,
	AlertTriangle,
	Clock3,
	Layers3,
	RefreshCw,
	Send,
	Video,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { formatRelativeToNow } from "@/lib/formatRelative";
import { cn } from "@/lib/utils";
import { registerUsageViewRefresher } from "@/lib/gateway/usage/refreshBus";
import {
	formatDateTime,
	formatWordyDateTime,
} from "@/lib/gateway/usage/timeFormatting";
import { formatAsyncJobFailureSummary } from "@/lib/gateway/usage/asyncJobFailureSummary";
import { formatRoomError } from "@/lib/chat/formatRoomError";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";
import Link from "next/link";
import {
        DetailKeyValueGrid,
        DetailMetricTile,
        DetailSection,
} from "./DetailDialogPrimitives";

const RequestDetailDialog = dynamic(() => import("./RequestDetailDialog"));

function AsyncJobHeader({
	job,
	modelMetadata,
	providerNames,
}: {
	job: AsyncJobDetailRow;
	modelMetadata: ModelMetadataMap;
	providerNames: Map<string, string>;
}) {
	const modelHref = getModelDetailsHref(job.model ?? null);
	const modelLabel = getModelDisplayName(job.model ?? null, modelMetadata);
	const modelLogoId = getModelLogoId(job.model ?? null, modelMetadata);
	const providerLabel = job.provider
		? providerNames.get(job.provider) ?? job.provider
		: null;
	const subtitle = [
		providerLabel,
		jobStatusPresentation(job.status).label,
		formatTimestamp(job.request_created_at ?? job.created_at),
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div>
			<div className="px-5 py-4 sm:px-6 sm:py-5">
				<div className="pr-10">
					<DialogTitle className="flex min-w-0 items-center gap-3 text-lg font-semibold">
						{modelLogoId ? (
							<Logo
								id={modelLogoId}
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
								{job.model ? modelLabel : "Async job"}
							</Link>
						) : (
							<span className="min-w-0 truncate">
								{job.model ? modelLabel : "Async job"}
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

function formatTimestamp(value: string | null | undefined): string {
	if (!value) return "-";
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) return value;
	return formatWordyDateTime(new Date(parsed), { includeTime: true });
}

function stopRowClick(event: React.MouseEvent<HTMLElement>) {
	event.stopPropagation();
}

function getModelDetailsHref(modelId: string | null): string | null {
	if (!modelId) return null;
	const [organisationId, ...modelParts] = modelId.split("/");
	if (!organisationId || modelParts.length === 0) return null;
	const routeModelId = modelParts.join("/");
	return `/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(routeModelId)}`;
}

function getModelLogoId(
	modelId: string | null,
	modelMetadata: ModelMetadataMap,
): string | null {
	if (!modelId) return null;
	const metadata = modelMetadata.get(modelId);
	if (metadata?.organisationId) return metadata.organisationId;
	if (modelId.includes("/")) {
		const [organisationId] = modelId.split("/");
		return organisationId || null;
	}
	return null;
}

function collectJobProviderIds(jobs: AsyncJobRow[]): string[] {
	return Array.from(
		new Set(
			jobs
				.map((job) => job.provider)
				.filter(
					(providerId): providerId is string =>
						typeof providerId === "string" && providerId.trim().length > 0,
				),
		),
	);
}

function collectJobAppIds(jobs: AsyncJobRow[]): string[] {
	return Array.from(
		new Set(
			jobs
				.map((job) => job.app_id)
				.filter(
					(appId): appId is string =>
						typeof appId === "string" && appId.trim().length > 0,
				),
		),
	);
}

function collectJobModelIds(jobs: AsyncJobRow[]): string[] {
	return Array.from(
		new Set(
			jobs
				.map((job) => job.model)
				.filter(
					(modelId): modelId is string =>
						typeof modelId === "string" && modelId.trim().length > 0,
				),
		),
	);
}

function buildUsageLogsFilterHref(args: {
	view: "logs" | "sessions";
	requestId?: string | null;
	sessionId?: string | null;
}): string {
	const next = new URLSearchParams();
	next.set("view", args.view);
	if (args.requestId) next.set("req", args.requestId);
	if (args.sessionId) next.set("session", args.sessionId);
	return `/settings/usage/logs?${next.toString()}`;
}

function formatMoneyFromNanos(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return `$${(value / 1e9).toFixed(5)}`;
}

function formatMoneyFromUsd(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return `$${value.toFixed(5)}`;
}

function formatMilliseconds(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	if (value < 1000) return `${Math.round(value)} ms`;
	return `${(value / 1000).toFixed(2)} s`;
}

function formatSettledCost(job: AsyncJobRow | AsyncJobDetailRow): string {
	if (job.settled_cost_nanos != null) return formatMoneyFromNanos(job.settled_cost_nanos);
	if (job.settled_cost_usd != null) return formatMoneyFromUsd(job.settled_cost_usd);
	return "-";
}

function formatRequestCountSummary(job: AsyncJobDetailRow): string {
	const counts = job.request_counts;
	if (!counts) return "-";
	const total = counts.total ?? 0;
	const completed = counts.completed ?? 0;
	const failed = counts.failed ?? 0;
	return `${completed}/${total} completed, ${failed} failed`;
}

function formatRequestPricingLine(line: AsyncJobRequestPricingLine): string {
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

	return parts.length > 0 ? parts.join(" · ") : JSON.stringify(line);
}

function formatStructuredDiagnostic(
	value: Record<string, unknown> | null | undefined,
): string {
	if (!value) return "{}";
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function webhookStatusBadgeClass(status: string | null | undefined): string {
	switch ((status ?? "").toLowerCase()) {
		case "completed":
		case "delivered":
			return "border-emerald-200 bg-emerald-50 text-emerald-700";
		case "scheduled_retry":
		case "pending":
		case "in_progress":
			return "border-amber-200 bg-amber-50 text-amber-700";
		case "failed":
		case "failed_permanently":
		case "cancelled":
			return "border-red-200 bg-red-50 text-red-700";
		default:
			return "border-slate-200 bg-slate-50 text-slate-700";
	}
}

function jobStatusPresentation(status: string | null | undefined): {
	label: "Queued" | "Processing" | "Completed" | "Failed" | "Cancelled" | "Expired";
	className: string;
} {
	switch ((status ?? "").trim().toLowerCase()) {
		case "pending":
		case "queued":
			return {
				label: "Queued",
				className: "border-slate-200 bg-slate-50 text-slate-700",
			};
		case "in_progress":
		case "processing":
		case "running":
			return {
				label: "Processing",
				className: "border-amber-200 bg-amber-50 text-amber-700",
			};
		case "completed":
		case "succeeded":
			return {
				label: "Completed",
				className: "border-emerald-200 bg-emerald-50 text-emerald-700",
			};
		case "failed":
		case "error":
			return {
				label: "Failed",
				className: "border-red-200 bg-red-50 text-red-700",
			};
		case "cancelled":
		case "canceled":
			return {
				label: "Cancelled",
				className: "border-zinc-200 bg-zinc-50 text-zinc-700",
			};
		case "expired":
		case "timed_out":
		case "timeout":
			return {
				label: "Expired",
				className: "border-orange-200 bg-orange-50 text-orange-700",
			};
		default:
			return {
				label: "Queued",
				className: "border-slate-200 bg-slate-50 text-slate-700",
			};
	}
}

function kindIcon(kind: string) {
	return kind === "video" ? Video : Layers3;
}

function AttemptStatusBadge({ status }: { status: string | null | undefined }) {
	return (
		<Badge variant="outline" className={webhookStatusBadgeClass(status)}>
			{status ?? "unknown"}
		</Badge>
	);
}

function JobStatusBadge({ status }: { status: string | null | undefined }) {
	const presentation = jobStatusPresentation(status);
	return (
		<Badge variant="outline" className={presentation.className}>
			{presentation.label}
		</Badge>
	);
}

function buildFileContentPath(fileId: string | null | undefined): string | null {
	if (!fileId) return null;
	const trimmed = fileId.trim();
	if (!trimmed) return null;
	return `/v1/files/${encodeURIComponent(trimmed)}/content`;
}

function CopyableCodeValue({
	value,
	copyLabel,
}: {
	value: string | null | undefined;
	copyLabel: string;
}) {
	if (!value) return <>-</>;

	return (
		<div className="flex items-center gap-2">
			<code className="min-w-0 truncate font-mono text-xs">{value}</code>
			<CopyButton
				size="sm"
				variant="ghost"
				className="text-muted-foreground hover:text-foreground"
				content={value}
				aria-label={copyLabel}
			/>
		</div>
	);
}

function AsyncJobAppBadge({
	appId,
	appLabel,
	href,
}: {
	appId: string | null;
	appLabel: string | null;
	href: string | null;
}) {
	if (!appId || !appLabel) return null;

	const badge = (
		<Badge
			variant="outline"
			className="inline-flex max-w-[220px] items-center gap-2"
		>
			<AppWindow className="h-3.5 w-3.5 text-muted-foreground" />
			<span className="truncate">{appLabel}</span>
		</Badge>
	);

	if (!href) return badge;

	return (
		<Link
			href={href}
			className="underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
			onClick={stopRowClick}
		>
			{badge}
		</Link>
	);
}

function AsyncJobDetailDialog({
	job,
	modelMetadata,
	providerNames,
	appMetadata,
	open,
	onOpenChange,
	onInspectRequest,
	isInspectingRequest,
}: {
	job: AsyncJobDetailRow | null;
	modelMetadata: ModelMetadataMap;
	providerNames: Map<string, string>;
	appMetadata: Map<string, AppMetadata>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInspectRequest: ((requestId: string) => void) | null;
	isInspectingRequest: boolean;
}) {
	const requestFilterHref = job?.request_id
		? buildUsageLogsFilterHref({
				view: "logs",
				requestId: job.request_id,
		  })
		: null;
	const sessionFilterHref = job?.session_id
		? buildUsageLogsFilterHref({
				view: "sessions",
				sessionId: job.session_id,
		  })
		: null;
	const appHref = job?.app_id ? `/apps/${encodeURIComponent(job.app_id)}` : null;
	const appTitle =
		job?.app_id
			? appMetadata.get(job.app_id)?.title?.trim() || job.app_id
			: null;
	const formattedRequestError = job?.request_error_payload
		? formatRoomError(JSON.stringify(job.request_error_payload))
		: job?.request_error_message?.trim()
			? formatRoomError(job.request_error_message)
			: null;
	const failedRequestProviders = formattedRequestError?.failedProviders ?? [];
	const failedRequestStatuses = formattedRequestError?.failedStatuses ?? [];
	const hasJobFailureDiagnostics = Boolean(
		job &&
			(job.job_upstream_error ||
				job.job_provider_failure_diagnostics ||
				job.job_failure_sample.length > 0 ||
				job.job_routing_diagnostics ||
				job.job_provider_enablement ||
				job.job_provider_candidate_diagnostics),
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
				<DialogHeader className="sr-only">
					<DialogTitle>Async job details</DialogTitle>
				</DialogHeader>

				{job ? (
					<div>
						<AsyncJobHeader
							job={job}
							modelMetadata={modelMetadata}
							providerNames={providerNames}
						/>

						<div className="max-h-[calc(90vh-110px)] space-y-6 overflow-y-auto p-5 sm:p-6">
							<div className="grid grid-cols-2 gap-2 md:grid-cols-3">
								<DetailMetricTile
									icon={Clock3}
									label="Request cost"
									value={<span className="font-mono">{formatMoneyFromNanos(job.request_cost_nanos)}</span>}
									tone="amber"
									compact
								/>
								<DetailMetricTile
									icon={Layers3}
									label="Settled cost"
									value={<span className="font-mono">{formatSettledCost(job)}</span>}
									tone={job.charged ? "emerald" : "slate"}
									compact
								/>
								<DetailMetricTile
									icon={Send}
									label="Delivered events"
									value={job.webhook.delivered_events}
									tone="emerald"
									compact
								/>
								<DetailMetricTile
									icon={AlertTriangle}
									label="Pending retries"
									value={job.webhook.pending_retries}
									tone={job.webhook.pending_retries > 0 ? "rose" : "slate"}
									compact
								/>
								<DetailMetricTile
									icon={Clock3}
									label="Next retry"
									value={job.webhook.next_retry_at ? formatTimestamp(job.webhook.next_retry_at) : "-"}
									tone="slate"
									compact
								/>
								<DetailMetricTile
									icon={Layers3}
									label={job.kind === "video" ? "Resolution" : "Endpoint"}
									value={job.kind === "video" ? (job.resolution ?? "-") : (job.endpoint ?? "-")}
									tone="violet"
									compact
								/>
								<DetailMetricTile
									icon={Video}
									label={job.kind === "video" ? "Output duration" : "Completion window"}
									value={
										job.kind === "video"
											? job.duration_seconds != null
												? `${job.duration_seconds}s`
												: "-"
											: job.completion_window ?? "-"
									}
									tone="sky"
									compact
								/>
								{job.kind === "video" ? (
									<DetailMetricTile
										icon={Clock3}
										label="Total duration"
										value={formatMilliseconds(job.total_duration_ms)}
										tone="slate"
										compact
									/>
								) : null}
								{job.kind === "video" ? (
									<DetailMetricTile
										icon={Clock3}
										label="Latency"
										value={formatMilliseconds(job.latency_ms)}
										tone="amber"
										compact
									/>
								) : null}
								{job.kind === "video" ? (
									<DetailMetricTile
										icon={Clock3}
										label="Generation"
										value={formatMilliseconds(job.generation_ms)}
										tone="violet"
										compact
									/>
								) : null}
								{job.kind === "video" ? (
									<DetailMetricTile
										icon={Layers3}
										label="Reservation"
										value={job.reservation_status ?? "-"}
										tone={job.charged ? "emerald" : "slate"}
										compact
									/>
								) : null}
								{job.key_source ? (
									<DetailMetricTile
										icon={Layers3}
										label="Key source"
										value={job.key_source ?? "-"}
										tone={job.key_source === "byok" ? "amber" : "slate"}
										compact
									/>
								) : null}
								{job.kind === "video" ? (
									<DetailMetricTile
										icon={Clock3}
										label="Polled status"
										value={job.polled_status ?? "-"}
										tone="slate"
										compact
									/>
								) : null}
								{job.kind === "batch" ? (
									<DetailMetricTile
										icon={Send}
										label="Request counts"
										value={formatRequestCountSummary(job)}
										tone="slate"
										compact
									/>
								) : null}
							</div>

							<DetailSection title="Job details" className="border-none bg-transparent p-0">
								<DetailKeyValueGrid
									columns={2}
									items={[
										{
											label: "Job ID",
											value: (
												<div className="flex items-center gap-2">
													<code className="min-w-0 truncate font-mono text-xs">
														{job.internal_id}
													</code>
													<CopyButton
														size="sm"
														variant="ghost"
														className="text-muted-foreground hover:text-foreground"
														content={job.internal_id}
														aria-label="Copy job id"
													/>
												</div>
											),
										},
										{
											label: "Request ID",
											value: job.request_id ? (
												<div className="flex items-center gap-2">
													{requestFilterHref ? (
														<Link
															href={requestFilterHref}
															className="min-w-0 truncate font-mono text-xs underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
														>
															{job.request_id}
														</Link>
													) : (
														<code className="min-w-0 truncate font-mono text-xs">
															{job.request_id}
														</code>
													)}
													<CopyButton
														size="sm"
														variant="ghost"
														className="text-muted-foreground hover:text-foreground"
														content={job.request_id}
														aria-label="Copy request id"
													/>
													{onInspectRequest ? (
														<Button
															type="button"
															variant="ghost"
															size="sm"
															className="h-7 px-2 text-xs"
															onClick={() => onInspectRequest(job.request_id!)}
															disabled={isInspectingRequest}
														>
															{isInspectingRequest ? "Loading..." : "Inspect"}
														</Button>
													) : null}
												</div>
											) : (
												"-"
											),
										},
										{
											label: "Native ID",
											value: (
												<CopyableCodeValue
													value={job.native_id}
													copyLabel="Copy native id"
												/>
											),
										},
										{
											label: "Session ID",
											value: job.session_id ? (
												<div className="flex items-center gap-2">
													{sessionFilterHref ? (
														<Link
															href={sessionFilterHref}
															className="min-w-0 truncate font-mono text-xs underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
														>
															{job.session_id}
														</Link>
													) : (
														<code className="min-w-0 truncate font-mono text-xs">
															{job.session_id}
														</code>
													)}
													<CopyButton
														size="sm"
														variant="ghost"
														className="text-muted-foreground hover:text-foreground"
														content={job.session_id}
														aria-label="Copy session id"
													/>
												</div>
											) : (
												"-"
											),
										},
										{
											label: "App",
											value: job.app_id ? (
												<div className="flex items-center gap-2">
													{appHref ? (
														<Link
															href={appHref}
															className="min-w-0 truncate font-mono text-xs underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
														>
															{appTitle}
														</Link>
													) : (
														<code className="min-w-0 truncate font-mono text-xs">
															{appTitle}
														</code>
													)}
													<CopyButton
														size="sm"
														variant="ghost"
														className="text-muted-foreground hover:text-foreground"
														content={job.app_id}
														aria-label="Copy app id"
													/>
												</div>
											) : (
												"-"
											),
										},
										{
											label: "Provider",
											value: job.provider ? (
												<Link
													href={`/api-providers/${encodeURIComponent(job.provider)}`}
													className="inline-flex items-center gap-2 underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
												>
													<Logo
														id={job.provider}
														width={16}
														height={16}
														className="flex-shrink-0"
													/>
													<span>{providerNames.get(job.provider) ?? job.provider}</span>
												</Link>
											) : (
												"-"
											),
										},
										{
											label: "Model ID",
											value: job.model ? (
												<code className="font-mono text-xs">{job.model}</code>
											) : (
												"-"
											),
										},
										{
											label: "Status",
											value: <JobStatusBadge status={job.status} />,
										},
										{
											label: "Lifecycle state",
											value: job.lifecycle_status ? (
												<span className="capitalize">{job.lifecycle_status}</span>
											) : (
												"-"
											),
										},
										{
											label: "Job type",
											value: (
												<span className="inline-flex items-center gap-2 capitalize">
													{React.createElement(kindIcon(job.kind), {
														className: "h-4 w-4 text-muted-foreground",
													})}
													{job.kind}
												</span>
											),
										},
										{
											label: job.kind === "video" ? "Resolution" : "Endpoint",
											value: job.kind === "video" ? (job.resolution ?? "-") : (job.endpoint ?? "-"),
										},
										{
											label: job.kind === "video" ? "Output duration" : "Completion window",
											value:
												job.kind === "video"
													? job.duration_seconds != null
														? `${job.duration_seconds}s`
														: "-"
													: job.completion_window ?? "-",
										},
										{
											label: "Total duration",
											value:
												job.kind === "video"
													? formatMilliseconds(job.total_duration_ms)
													: "-",
										},
										{
											label: "Latency",
											value:
												job.kind === "video"
													? formatMilliseconds(job.latency_ms)
													: "-",
										},
										{
											label: "Generation",
											value:
												job.kind === "video"
													? formatMilliseconds(job.generation_ms)
													: "-",
										},
										{
											label: "Output access",
											value:
												job.kind === "video"
													? job.output_access ?? "-"
													: "-",
										},
										{
											label: "Key source",
											value:
												job.kind === "video" || job.kind === "batch"
													? job.key_source ?? "-"
													: "-",
										},
										{
											label: "BYOK key ID",
											value:
												job.kind === "video" || job.kind === "batch" ? (
													<CopyableCodeValue
														value={job.byok_key_id}
														copyLabel="Copy BYOK key id"
													/>
												) : (
													"-"
												),
										},
										{
											label: "Reservation ID",
											value:
												job.kind === "video" ? (
													<CopyableCodeValue
														value={job.reservation_id}
														copyLabel="Copy reservation id"
													/>
												) : (
													"-"
												),
										},
										{
											label: "Reservation status",
											value:
												job.kind === "video"
													? job.reservation_status ?? "-"
													: "-",
										},
										{
											label: "Finalized",
											value:
												job.kind === "video" || job.kind === "batch"
													? formatTimestamp(job.finalized_at)
													: "-",
										},
										{
											label: "Last polled",
											value:
												job.kind === "video"
													? formatTimestamp(job.last_polled_at)
													: "-",
										},
										{
											label: "Polled status",
											value:
												job.kind === "video"
													? job.polled_status ?? "-"
													: "-",
										},
										{
											label: "Last reconciled",
											value:
												job.kind === "video"
													? formatTimestamp(job.last_reconciled_at)
													: "-",
										},
										{ label: "Created", value: formatTimestamp(job.created_at) },
										{ label: "Updated", value: formatTimestamp(job.updated_at) },
										{
											label: "Billed",
											value: job.billed_at ? formatTimestamp(job.billed_at) : "Not billed",
										},
										{
											label: "Billing reason",
											value: job.billing_reason ?? "-",
										},
										{
											label: "Charged",
											value:
												job.charged == null ? "-" : job.charged ? "Yes" : "No",
										},
										{
											label: "Settled cost",
											value: <span className="font-mono">{formatSettledCost(job)}</span>,
										},
										{
											label: "Request created",
											value: formatTimestamp(job.request_created_at),
										},
										{
											label: "Batch request counts",
											value: job.kind === "batch" ? formatRequestCountSummary(job) : "-",
										},
									]}
								/>
							</DetailSection>

							{job.kind === "batch" ? (
								<DetailSection title="Batch settlement">
									<DetailKeyValueGrid
										columns={2}
										items={[
											{
												label: "Settled cost",
												value: <span className="font-mono">{formatSettledCost(job)}</span>,
											},
											{
												label: "Pricing total nanos",
												value: job.pricing_breakdown?.total_nanos != null ? (
													<code className="font-mono text-xs">
														{job.pricing_breakdown.total_nanos.toLocaleString()}
													</code>
												) : (
													"-"
												),
											},
											{
												label: "Completed requests",
												value:
													job.request_counts?.completed ??
													job.pricing_breakdown?.completed_requests ??
													"-",
											},
											{
												label: "Failed requests",
												value:
													job.request_counts?.failed ??
													job.pricing_breakdown?.failed_requests ??
													"-",
											},
											{
												label: "Total requests",
												value:
													job.request_counts?.total ??
													job.pricing_breakdown?.total_requests ??
													"-",
											},
											{
												label: "Pricing total USD",
												value: job.pricing_breakdown?.total_usd_str ? (
													<code className="font-mono text-xs">
														${job.pricing_breakdown.total_usd_str}
													</code>
												) : (
													"-"
												),
											},
											{
												label: "Pricing lines",
												value: job.batch_pricing_lines.length.toLocaleString(),
											},
										]}
									/>

									{job.batch_pricing_lines.length > 0 ? (
										<div className="mt-4 space-y-2 rounded-xl border border-border/60 p-4">
											<div className="text-sm font-medium">Batch pricing lines</div>
											<div className="space-y-2">
												{job.batch_pricing_lines.map((line, index) => (
													<div
														key={`batch-pricing-line-${index}`}
														className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
													>
														<code className="whitespace-pre-wrap break-words font-mono text-xs">
															{formatRequestPricingLine(line)}
														</code>
													</div>
												))}
											</div>
										</div>
									) : null}
								</DetailSection>
							) : null}

							{job.request_native_response_id ||
							job.request_endpoint ||
							job.request_model_id ||
							job.request_success != null ||
							job.request_status_code != null ||
							job.request_error_code ||
							job.request_error_message ||
							job.request_finish_reason ||
							job.request_latency_ms != null ||
							job.request_generation_ms != null ||
							job.request_pricing_lines.length > 0 ||
							job.request_provider_attempts.length > 0 ? (
								<DetailSection title="Create request execution">
									<DetailKeyValueGrid
										columns={2}
										items={[
											{
												label: "Native request ID",
												value: (
													<CopyableCodeValue
														value={job.request_native_response_id}
														copyLabel="Copy native request id"
													/>
												),
											},
											{
												label: "Request endpoint",
												value: job.request_endpoint ?? "-",
											},
											{
												label: "Request model ID",
												value: (
													<CopyableCodeValue
														value={job.request_model_id}
														copyLabel="Copy request model id"
													/>
												),
											},
											{
												label: "Request success",
												value:
													job.request_success == null
														? "-"
														: job.request_success
															? "true"
															: "false",
											},
											{
												label: "Status code",
												value:
													job.request_status_code != null
														? String(job.request_status_code)
														: "-",
											},
											{
												label: "Error code",
												value: job.request_error_code ?? "-",
											},
											{
												label: "Finish reason",
												value: job.request_finish_reason ?? "-",
											},
											{
												label: "Request latency",
												value: formatMilliseconds(job.request_latency_ms),
											},
											{
												label: "Request generation",
												value: formatMilliseconds(job.request_generation_ms),
											},
											{
												label: "Provider attempts",
												value: job.request_provider_attempts.length.toLocaleString(),
											},
											{
												label: "Pricing lines",
												value: job.request_pricing_lines.length.toLocaleString(),
											},
										]}
									/>

									{job.request_pricing_lines.length > 0 ? (
										<div className="mt-4 space-y-2 rounded-xl border border-border/60 p-4">
											<div className="text-sm font-medium">Request pricing lines</div>
											<div className="space-y-2">
												{job.request_pricing_lines.map((line, index) => (
													<div
														key={`pricing-line-${index}`}
														className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
													>
														<code className="whitespace-pre-wrap break-words font-mono text-xs">
															{formatRequestPricingLine(line)}
														</code>
													</div>
												))}
											</div>
										</div>
									) : null}

									{job.request_error_message ? (
										<div className="mt-4 space-y-2 rounded-xl border border-border/60 p-4">
											<div className="text-sm font-medium">
												{formattedRequestError?.title?.trim()
													? formattedRequestError.title
													: "Request error message"}
											</div>
											<div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
												{formattedRequestError?.message ?? job.request_error_message}
											</div>
											{formattedRequestError?.hint ? (
												<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
													<div className="mb-1 font-medium text-amber-900">Hint</div>
													<div className="whitespace-pre-wrap break-words">
														{formattedRequestError.hint}
													</div>
												</div>
											) : null}
											{formattedRequestError?.generationId ? (
												<div className="flex items-center gap-2 text-xs text-muted-foreground">
													<span>Generation ID:</span>
													<code className="font-mono">
														{formattedRequestError.generationId}
													</code>
													<CopyButton
														size="sm"
														content={formattedRequestError.generationId}
														aria-label="Copy generation id"
													/>
												</div>
											) : null}
											{formattedRequestError?.upstreamError ? (
												<div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
													<div className="mb-1 font-medium">Upstream error</div>
													<div className="space-y-1 text-slate-800">
														{formattedRequestError.upstreamError.code ? (
															<div>
																<span className="font-medium">Code:</span>{" "}
																<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
																	{formattedRequestError.upstreamError.code}
																</code>
															</div>
														) : null}
														{formattedRequestError.upstreamError.message ? (
															<div>
																<span className="font-medium">Message:</span>{" "}
																{formattedRequestError.upstreamError.message}
															</div>
														) : null}
														{formattedRequestError.upstreamError.description ? (
															<div>
																<span className="font-medium">Detail:</span>{" "}
																{formattedRequestError.upstreamError.description}
															</div>
														) : null}
														{formattedRequestError.upstreamError.param ? (
															<div>
																<span className="font-medium">Param:</span>{" "}
																<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
																	{formattedRequestError.upstreamError.param}
																</code>
															</div>
														) : null}
													</div>
												</div>
											) : null}
											{formattedRequestError?.reason ||
											formattedRequestError?.attemptCount != null ||
											failedRequestProviders.length > 0 ||
											failedRequestStatuses.length > 0 ? (
												<div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
													<div className="mb-1 font-medium">Routing failure summary</div>
													<div className="space-y-1 text-slate-800">
														{formattedRequestError?.reason ? (
															<div>
																<span className="font-medium">Reason:</span>{" "}
																<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
																	{formattedRequestError.reason}
																</code>
															</div>
														) : null}
														{formattedRequestError?.attemptCount != null ? (
															<div>
																<span className="font-medium">Attempts:</span>{" "}
																{formattedRequestError.attemptCount}
															</div>
														) : null}
														{failedRequestProviders.length > 0 ? (
															<div>
																<span className="font-medium">Failed providers:</span>{" "}
																{failedRequestProviders.join(", ")}
															</div>
														) : null}
														{failedRequestStatuses.length > 0 ? (
															<div>
																<span className="font-medium">Failed statuses:</span>{" "}
																{failedRequestStatuses.join(", ")}
															</div>
														) : null}
													</div>
												</div>
											) : null}
										</div>
									) : null}

									{job.request_provider_attempts.length > 0 ? (
										<div className="mt-4 overflow-x-auto rounded-xl border border-border/60">
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
													{job.request_provider_attempts.map((attempt, index) => (
														<TableRow key={`${attempt.provider ?? "provider"}:${attempt.attempt_number ?? index}`}>
															<TableCell>{attempt.attempt_number ?? index + 1}</TableCell>
															<TableCell>{attempt.provider ?? "-"}</TableCell>
															<TableCell>
																{attempt.status != null
																	? `${attempt.status}${attempt.status_text ? ` ${attempt.status_text}` : ""}`
																	: "-"}
															</TableCell>
															<TableCell>{attempt.outcome ?? "-"}</TableCell>
															<TableCell>{formatMilliseconds(attempt.duration_ms)}</TableCell>
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
								</DetailSection>
							) : null}

							{hasJobFailureDiagnostics ? (
								<DetailSection title="Job failure diagnostics">
									<DetailKeyValueGrid
										columns={2}
										items={[
											{
												label: "Failure category",
												value: job.job_provider_failure_diagnostics?.category ?? "-",
											},
											{
												label: "Failure provider",
												value: job.job_provider_failure_diagnostics?.provider ?? "-",
											},
											{
												label: "Failure hint",
												value: job.job_provider_failure_diagnostics?.hint ?? "-",
											},
											{
												label: "Failure samples",
												value: job.job_failure_sample.length.toLocaleString(),
											},
										]}
									/>

									{job.job_upstream_error ? (
										<div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
											<div className="mb-1 font-medium">Upstream error</div>
											<div className="space-y-1 text-slate-800">
												{job.job_upstream_error.code ? (
													<div>
														<span className="font-medium">Code:</span>{" "}
														<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
															{job.job_upstream_error.code}
														</code>
													</div>
												) : null}
												{job.job_upstream_error.type ? (
													<div>
														<span className="font-medium">Type:</span>{" "}
														<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
															{job.job_upstream_error.type}
														</code>
													</div>
												) : null}
												{job.job_upstream_error.status != null ? (
													<div>
														<span className="font-medium">Status:</span>{" "}
														{job.job_upstream_error.status}
													</div>
												) : null}
												{job.job_upstream_error.message ? (
													<div>
														<span className="font-medium">Message:</span>{" "}
														{job.job_upstream_error.message}
													</div>
												) : null}
												{job.job_upstream_error.description ? (
													<div>
														<span className="font-medium">Detail:</span>{" "}
														{job.job_upstream_error.description}
													</div>
												) : null}
												{job.job_upstream_error.param ? (
													<div>
														<span className="font-medium">Param:</span>{" "}
														<code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">
															{job.job_upstream_error.param}
														</code>
													</div>
												) : null}
											</div>
										</div>
									) : null}

									{job.job_failure_sample.length > 0 ? (
										<div className="mt-4 space-y-2 rounded-xl border border-border/60 p-4">
											<div className="text-sm font-medium">Failure samples</div>
											<div className="space-y-2">
												{job.job_failure_sample.map((sample, index) => (
													<div
														key={`job-failure-sample-${index}`}
														className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm"
													>
														<div className="font-medium">
															{sample.provider ?? "Unknown provider"}
															{sample.type ? ` · ${sample.type}` : ""}
															{sample.status != null ? ` · ${sample.status}` : ""}
														</div>
														<div className="mt-1 space-y-1 text-muted-foreground">
															{sample.retryable != null ? (
																<div>Retryable: {sample.retryable ? "true" : "false"}</div>
															) : null}
															{sample.upstream_error_code ? (
																<div>
																	Code:{" "}
																	<code className="font-mono text-xs">
																		{sample.upstream_error_code}
																	</code>
																</div>
															) : null}
															{sample.upstream_error_message ? (
																<div>{sample.upstream_error_message}</div>
															) : null}
															{sample.upstream_error_description &&
															sample.upstream_error_description !== sample.upstream_error_message ? (
																<div>{sample.upstream_error_description}</div>
															) : null}
															{sample.upstream_error_param ? (
																<div>
																	Param:{" "}
																	<code className="font-mono text-xs">
																		{sample.upstream_error_param}
																	</code>
																</div>
															) : null}
														</div>
													</div>
												))}
											</div>
										</div>
									) : null}

									{job.job_routing_diagnostics ||
									job.job_provider_enablement ||
									job.job_provider_candidate_diagnostics ? (
										<div className="mt-4 grid gap-4 xl:grid-cols-3">
											{job.job_routing_diagnostics ? (
												<div className="rounded-xl border border-border/60 p-4">
													<div className="mb-2 text-sm font-medium">Routing diagnostics</div>
													<code className="whitespace-pre-wrap break-words font-mono text-xs">
														{formatStructuredDiagnostic(job.job_routing_diagnostics)}
													</code>
												</div>
											) : null}
											{job.job_provider_enablement ? (
												<div className="rounded-xl border border-border/60 p-4">
													<div className="mb-2 text-sm font-medium">Provider enablement</div>
													<code className="whitespace-pre-wrap break-words font-mono text-xs">
														{formatStructuredDiagnostic(job.job_provider_enablement)}
													</code>
												</div>
											) : null}
											{job.job_provider_candidate_diagnostics ? (
												<div className="rounded-xl border border-border/60 p-4">
													<div className="mb-2 text-sm font-medium">Candidate diagnostics</div>
													<code className="whitespace-pre-wrap break-words font-mono text-xs">
														{formatStructuredDiagnostic(job.job_provider_candidate_diagnostics)}
													</code>
												</div>
											) : null}
										</div>
									) : null}
								</DetailSection>
							) : null}

							{job.kind === "batch" || job.content_url ? (
								<DetailSection title="Artifacts and actions">
									<DetailKeyValueGrid
										columns={2}
										items={[
											{
												label: "Output file ID",
												value: (
													<CopyableCodeValue
														value={job.output_file_id}
														copyLabel="Copy output file id"
													/>
												),
											},
											{
												label: "Output content endpoint",
												value: (
													<CopyableCodeValue
														value={buildFileContentPath(job.output_file_id)}
														copyLabel="Copy output file content endpoint"
													/>
												),
											},
											{
												label: "Error file ID",
												value: (
													<CopyableCodeValue
														value={job.error_file_id}
														copyLabel="Copy error file id"
													/>
												),
											},
											{
												label: "Error content endpoint",
												value: (
													<CopyableCodeValue
														value={buildFileContentPath(job.error_file_id)}
														copyLabel="Copy error file content endpoint"
													/>
												),
											},
											{
												label: "Content URL",
												value: job.content_url ? (
													<div className="flex flex-wrap items-center gap-2">
														<Link
															href={job.content_url}
															target="_blank"
															rel="noreferrer"
															className="min-w-0 truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
														>
															{job.content_url}
														</Link>
														<CopyButton
															size="sm"
															variant="ghost"
															className="text-muted-foreground hover:text-foreground"
															content={job.content_url}
															aria-label="Copy content url"
														/>
													</div>
												) : (
													"-"
												),
											},
											{
												label: "Cancel endpoint",
												value: (
													<CopyableCodeValue
														value={job.cancel_url}
														copyLabel="Copy cancel endpoint"
													/>
												),
											},
										]}
									/>
								</DetailSection>
							) : null}

							<div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
								<DetailSection title="Webhook configuration">
									<DetailKeyValueGrid
										columns={1}
										items={[
											{
												label: "Webhook URL",
												value: job.webhook.url ?? "No webhook configured",
											},
											{
												label: "Subscribed events",
												value:
													job.webhook.events.length > 0
														? job.webhook.events.join(", ")
														: "-",
											},
											{
												label: "Signing",
												value: job.webhook.configured
													? job.webhook.has_secret
														? "Enabled"
														: "Disabled"
													: "-",
											},
											{
												label: "Last attempt",
												value: job.webhook.last_attempt_at
													? formatTimestamp(job.webhook.last_attempt_at)
													: "-",
											},
											{
												label: "Last attempt status",
												value: job.webhook.last_attempt_status ? (
													<AttemptStatusBadge status={job.webhook.last_attempt_status} />
												) : (
													"-"
												),
											},
											{
												label: "Last response status",
												value: job.webhook.last_response_status ?? "-",
											},
											{
												label: "Last delivered",
												value: formatTimestamp(job.webhook.last_delivered_at),
											},
											{
												label: "Last failure",
												value: formatTimestamp(job.webhook.last_failure_at),
											},
											{
												label: "Last dispatched",
												value: formatTimestamp(job.last_webhook_dispatched_at),
											},
											{
												label: "Last progress",
												value:
													job.last_webhook_progress != null
														? `${job.last_webhook_progress}%`
														: "-",
											},
											{
												label: "Last progress update",
												value: formatTimestamp(job.last_webhook_progress_at),
											},
										]}
									/>
								</DetailSection>
								<DetailSection title="Webhook summary">
									<DetailKeyValueGrid
										columns={1}
										items={[
											{
												label: "Delivered events",
												value: job.webhook.delivered_events.toLocaleString(),
											},
											{
												label: "Delivered event types",
												value:
													job.webhook.delivered_event_types.length > 0
														? job.webhook.delivered_event_types.join(", ")
														: "-",
											},
											{
												label: "Pending retries",
												value: job.webhook.pending_retries.toLocaleString(),
											},
											{
												label: "Attempts recorded",
												value: job.webhook_attempts.length.toLocaleString(),
											},
											{
												label: "Next retry",
												value: formatTimestamp(
													job.next_webhook_retry_at ?? job.webhook.next_retry_at,
												),
											},
										]}
									/>
								</DetailSection>
							</div>

							<DetailSection title="Webhook attempts">
								{job.webhook_attempts.length === 0 ? (
									<div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
										No webhook attempts recorded yet.
									</div>
								) : (
									<div className="rounded-lg border">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Event</TableHead>
													<TableHead>Status</TableHead>
													<TableHead>Attempt</TableHead>
													<TableHead>Tried</TableHead>
													<TableHead>Response</TableHead>
													<TableHead>Next retry</TableHead>
													<TableHead>Error</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{job.webhook_attempts.map((attempt) => (
													<TableRow key={attempt.id}>
														<TableCell className="font-mono text-xs">{attempt.event_type}</TableCell>
														<TableCell><AttemptStatusBadge status={attempt.status} /></TableCell>
														<TableCell>{attempt.attempt_number} / {attempt.max_attempts}</TableCell>
														<TableCell>{formatTimestamp(attempt.tried_at)}</TableCell>
														<TableCell>{attempt.response_status ?? "-"}</TableCell>
														<TableCell>{formatTimestamp(attempt.next_retry_at)}</TableCell>
														<TableCell className="max-w-[260px] whitespace-normal break-words text-xs text-muted-foreground">
															{attempt.error_message ?? attempt.response_body_preview ?? "-"}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								)}
							</DetailSection>
						</div>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

export default function AsyncJobsPanel({
	initialJobs,
	title = "Async job webhooks",
	description = "Recent video and batch jobs with webhook delivery history, pending retries, and failures.",
	emptyMessage = "No async jobs with webhook activity yet.",
	refreshLimit = 20,
	includeWithoutWebhook = false,
	variant = "card",
	providerNames,
	modelMetadata,
	appMetadata,
	timeRange,
	showRefreshButton = true,
	kindFilter = null,
	statusFilter = null,
	providerFilter = null,
}: {
	initialJobs: AsyncJobRow[];
	title?: string;
	description?: string;
	emptyMessage?: string;
	refreshLimit?: number;
	includeWithoutWebhook?: boolean;
	variant?: "card" | "logs";
	providerNames?: Map<string, string>;
	modelMetadata?: ModelMetadataMap;
	appMetadata?: Map<string, AppMetadata>;
	timeRange?: { from: string; to: string };
	showRefreshButton?: boolean;
	kindFilter?: "video" | "batch" | null;
	statusFilter?: string | null;
	providerFilter?: string | null;
}) {
	const userTimeZone =
		typeof Intl !== "undefined"
			? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			: "UTC";
	const [jobs, setJobs] = React.useState(initialJobs);
	const [resolvedProviderNames, setResolvedProviderNames] = React.useState(
		() => new Map(providerNames ?? []),
	);
	const [resolvedModelMetadata, setResolvedModelMetadata] =
		React.useState<ModelMetadataMap>(() => new Map(modelMetadata ?? []));
	const [resolvedAppMetadata, setResolvedAppMetadata] = React.useState(
		() => new Map(appMetadata ?? []),
	);
	const [open, setOpen] = React.useState(false);
	const [selectedJob, setSelectedJob] = React.useState<AsyncJobDetailRow | null>(null);
	const [requestDetailOpen, setRequestDetailOpen] = React.useState(false);
	const [selectedRequest, setSelectedRequest] = React.useState<RequestRow | null>(null);
	const [requestDetailAppName, setRequestDetailAppName] = React.useState<string | null>(null);
	const [requestDetailProviderNames, setRequestDetailProviderNames] = React.useState(
		() => new Map<string, string>(),
	);
	const [requestDetailProviderMetadata, setRequestDetailProviderMetadata] = React.useState(
		() => new Map<string, ProviderMetadataEntry>(),
	);
	const [requestDetailModelMetadata, setRequestDetailModelMetadata] =
		React.useState<ModelMetadataMap>(() => new Map());
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [isLoadingDetail, startLoadingDetail] = React.useTransition();
	const [isLoadingRequestDetail, startLoadingRequestDetail] = React.useTransition();
	const [relativeNowMs, setRelativeNowMs] = React.useState<number | null>(null);
	const detailCacheRef = React.useRef(
		new Map<string, AsyncJobDetailRow>(),
	);
	const requestDetailCacheRef = React.useRef(
		new Map<string, InvestigateGenerationResult>(),
	);

	React.useEffect(() => {
		setJobs(initialJobs);
	}, [initialJobs]);

	React.useEffect(() => {
		setResolvedProviderNames(new Map(providerNames ?? []));
	}, [providerNames]);

	React.useEffect(() => {
		setResolvedModelMetadata(new Map(modelMetadata ?? []));
	}, [modelMetadata]);

	React.useEffect(() => {
		setResolvedAppMetadata(new Map(appMetadata ?? []));
	}, [appMetadata]);

	React.useEffect(() => {
		const updateNow = () => setRelativeNowMs(Date.now());
		updateNow();
		const interval = setInterval(updateNow, 60_000);
		return () => clearInterval(interval);
	}, []);

	const refresh = React.useCallback(() => {
		return (async () => {
			setIsRefreshing(true);
			try {
				const next = await fetchRecentAsyncJobs({
					limit: refreshLimit,
					includeWithoutWebhook,
					timeRange,
					kind: kindFilter,
					status: statusFilter,
					provider: providerFilter,
				});
				setJobs(next);

				const missingProviderIds = collectJobProviderIds(next).filter(
					(providerId) => !resolvedProviderNames.has(providerId),
				);
				const missingModelIds = collectJobModelIds(next).filter(
					(modelId) => !resolvedModelMetadata.has(modelId),
				);
				const missingAppIds = collectJobAppIds(next).filter(
					(appId) => !resolvedAppMetadata.has(appId),
				);
				const [nextProviderNames, nextModelMetadata, nextAppMetadata] = await Promise.all([
					missingProviderIds.length > 0
						? fetchProviderNames(missingProviderIds)
						: Promise.resolve(new Map<string, string>()),
					missingModelIds.length > 0
						? fetchModelMetadata(missingModelIds)
						: Promise.resolve(new Map<string, { organisationId: string; organisationName: string; modelName?: string }>()),
					missingAppIds.length > 0
						? fetchAppMetadata(missingAppIds)
						: Promise.resolve(new Map<string, AppMetadata>()),
				]);
				if (nextProviderNames.size > 0) {
					setResolvedProviderNames(
						(prev) => new Map([...prev, ...nextProviderNames]),
					);
				}
				if (nextModelMetadata.size > 0) {
					setResolvedModelMetadata(
						(prev) => new Map([...prev, ...nextModelMetadata]),
					);
				}
				if (nextAppMetadata.size > 0) {
					setResolvedAppMetadata((prev) => new Map([...prev, ...nextAppMetadata]));
				}
			} finally {
				setIsRefreshing(false);
			}
		})();
	}, [
		includeWithoutWebhook,
		kindFilter,
		providerFilter,
		refreshLimit,
		resolvedAppMetadata,
		resolvedModelMetadata,
		resolvedProviderNames,
		statusFilter,
		timeRange,
	]);

	React.useEffect(() => registerUsageViewRefresher("jobs", refresh), [refresh]);

	const openDetail = React.useCallback((job: AsyncJobRow) => {
		setOpen(true);
		const cacheKey = `${job.kind}:${job.internal_id}`;
		const cached = detailCacheRef.current.get(cacheKey);
		if (cached) {
			setSelectedJob(cached);
			return;
		}
		setSelectedJob(null);
		startLoadingDetail(async () => {
			const detail = await fetchAsyncJobDetail({
				kind: job.kind,
				internalId: job.internal_id,
			});
			if (detail) {
				detailCacheRef.current.set(cacheKey, detail);
			}
			setSelectedJob(detail);
		});
	}, []);

	const openRequestDetail = React.useCallback((requestId: string) => {
		const trimmedRequestId = requestId.trim();
		if (!trimmedRequestId) return;
		setOpen(false);
		setRequestDetailOpen(true);
		const cached = requestDetailCacheRef.current.get(trimmedRequestId);
		if (cached) {
			setSelectedRequest(cached.request as RequestRow);
			setRequestDetailAppName(cached.appName ?? null);
			setRequestDetailModelMetadata(new Map(cached.modelMetadata ?? []));
			setRequestDetailProviderNames(new Map(cached.providerNames ?? []));
			setRequestDetailProviderMetadata(new Map(cached.providerMetadata ?? []));
			return;
		}
		setSelectedRequest(null);
		setRequestDetailAppName(null);
		setRequestDetailModelMetadata(new Map());
		setRequestDetailProviderNames(new Map());
		setRequestDetailProviderMetadata(new Map());
		startLoadingRequestDetail(async () => {
			const response = await investigateGeneration(trimmedRequestId);
			if (!response.success || !response.data) {
				setRequestDetailOpen(false);
				return;
			}
			requestDetailCacheRef.current.set(trimmedRequestId, response.data);
			setSelectedRequest(response.data.request as RequestRow);
			setRequestDetailAppName(response.data.appName ?? null);
			const nextModelMetadata = new Map(response.data.modelMetadata ?? []);
			const nextProviderNames = new Map(response.data.providerNames ?? []);
			const nextProviderMetadata = new Map(response.data.providerMetadata ?? []);
			setRequestDetailModelMetadata(nextModelMetadata);
			setRequestDetailProviderNames(nextProviderNames);
			setRequestDetailProviderMetadata(nextProviderMetadata);
			if (nextModelMetadata.size > 0) {
				setResolvedModelMetadata((prev) => new Map([...prev, ...nextModelMetadata]));
			}
			if (nextProviderNames.size > 0) {
				setResolvedProviderNames((prev) => new Map([...prev, ...nextProviderNames]));
			}
		});
	}, []);

	const table = jobs.length === 0 ? (
		<div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
			{emptyMessage}
		</div>
	) : (
	<>
		{variant === "logs" ? (
			<div className="space-y-3 md:hidden">
				{jobs.map((job) => {
					const timestamp = job.request_created_at ?? job.created_at;
					const providerLabel = job.provider
						? resolvedProviderNames.get(job.provider) ?? job.provider
						: null;
					const failureSummary = formatAsyncJobFailureSummary(job);
					const appLabel = job.app_id
						? resolvedAppMetadata.get(job.app_id)?.title?.trim() || job.app_id
						: null;
					const appHref = job.app_id ? `/apps/${encodeURIComponent(job.app_id)}` : null;
					const modelLabel = getModelDisplayName(
						job.model,
						resolvedModelMetadata,
					);
					const modelHref = getModelDetailsHref(job.model);
					const modelLogoId = getModelLogoId(
						job.model,
						resolvedModelMetadata,
					);
					const Icon = kindIcon(job.kind);
					return (
						<button
							key={`mobile-${job.kind}:${job.internal_id}`}
							type="button"
							className="w-full rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
							onClick={() => openDetail(job)}
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="font-mono text-xs text-muted-foreground">
										{timestamp ? formatTimestamp(timestamp) : "-"}
									</div>
									<div className="mt-1 flex items-center gap-2">
										{modelLogoId ? (
											<Logo
												id={modelLogoId}
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
													title={job.model ?? undefined}
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
											{job.kind === "batch" && (job.settled_cost_nanos != null || job.settled_cost_usd != null)
												? formatSettledCost(job)
												: formatMoneyFromNanos(job.request_cost_nanos)}
										</div>
										<div className="mt-1">
											<JobStatusBadge status={job.status} />
									</div>
								</div>
							</div>

							<div className="mt-3 flex flex-wrap items-center gap-2">
								{job.provider ? (
									<Badge
										variant="outline"
										className="inline-flex items-center gap-2"
									>
										<Logo
											id={job.provider}
											width={14}
											height={14}
											className="flex-shrink-0"
										/>
										<span className="truncate">{providerLabel}</span>
									</Badge>
								) : null}
								<AsyncJobAppBadge
									appId={job.app_id}
									appLabel={appLabel}
									href={appHref}
								/>
								<Badge
									variant="outline"
									className="inline-flex items-center gap-2 capitalize"
								>
									<Icon className="h-3.5 w-3.5 text-muted-foreground" />
									{job.kind}
								</Badge>
							</div>
							{failureSummary ? (
								<div className="mt-2 text-xs text-rose-700 line-clamp-2">
									{failureSummary}
								</div>
							) : null}
						</button>
					);
				})}
			</div>
		) : null}

		<div className={cn("rounded-lg border", variant === "logs" ? "hidden md:block" : undefined)}>
			<Table className={variant === "logs" ? "text-xs" : undefined}>
				<TableHeader>
					<TableRow className={variant === "logs" ? "h-9" : undefined}>
						{variant === "logs" ? <TableHead>Timestamp</TableHead> : null}
						{variant === "logs" ? <TableHead>Model</TableHead> : <TableHead>Job</TableHead>}
						{variant === "logs" ? <TableHead>Provider</TableHead> : null}
						{variant === "logs" ? <TableHead>Job</TableHead> : null}
						{variant === "logs" ? <TableHead className="text-right">Cost</TableHead> : null}
						<TableHead>Status</TableHead>
						{variant === "logs" ? null : <TableHead>Webhook</TableHead>}
						{variant === "logs" ? null : <TableHead>Last attempt</TableHead>}
						{variant === "logs" ? null : <TableHead>Next retry</TableHead>}
					</TableRow>
				</TableHeader>
				<TableBody>
					{jobs.map((job) => {
						const Icon = kindIcon(job.kind);
						const timestamp = job.request_created_at ?? job.created_at;
						const failureSummary = formatAsyncJobFailureSummary(job);
						const providerLabel = job.provider
							? resolvedProviderNames.get(job.provider) ?? job.provider
							: null;
						const appLabel = job.app_id
							? resolvedAppMetadata.get(job.app_id)?.title?.trim() || job.app_id
							: null;
						const appHref = job.app_id ? `/apps/${encodeURIComponent(job.app_id)}` : null;
						const modelLabel = getModelDisplayName(
							job.model,
							resolvedModelMetadata,
						);
						const modelHref = getModelDetailsHref(job.model);
						const modelLogoId = getModelLogoId(
							job.model,
							resolvedModelMetadata,
						);
						return (
							<TableRow
								key={`${job.kind}:${job.internal_id}`}
								className={cn(
									variant === "logs" ? "h-12" : undefined,
									"cursor-pointer hover:bg-muted/40",
								)}
								onClick={() => openDetail(job)}
							>
								{variant === "logs" ? (
									<TableCell className="py-2 font-mono text-xs">
										{timestamp ? (
											<HoverCard>
												<HoverCardTrigger asChild>
													<span className="cursor-help underline underline-offset-2 decoration-dotted">
														{formatTimestamp(timestamp)}
													</span>
												</HoverCardTrigger>
												<HoverCardContent align="start" className="w-auto">
													{(() => {
														const date = new Date(timestamp);
														const unixSeconds = Math.floor(
															date.getTime() / 1000,
														);
														return (
															<div className="grid gap-2 text-xs">
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">
																		{userTimeZone}
																	</div>
																	<div className="font-mono">
																		{formatDateTime(date, userTimeZone)}
																	</div>
																</div>
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">
																		UTC
																	</div>
																	<div className="font-mono">
																		{formatDateTime(date, "UTC")}
																	</div>
																</div>
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">
																		Relative
																	</div>
																	<div className="font-mono">
																		{relativeNowMs
																			? formatRelativeToNow(date, relativeNowMs)
																			: "-"}
																	</div>
																</div>
																<div className="grid grid-cols-[120px_1fr] gap-2">
																	<div className="text-muted-foreground">
																		Timestamp
																	</div>
																	<div className="font-mono">
																		{unixSeconds}
																	</div>
																</div>
															</div>
														);
													})()}
												</HoverCardContent>
											</HoverCard>
										) : (
											"-"
										)}
									</TableCell>
								) : null}
								{variant === "logs" ? (
									<TableCell className="py-2">
										<div className="max-w-[280px]">
											<div className="flex items-center gap-2">
												{modelLogoId ? (
													<Logo
														id={modelLogoId}
														width={16}
														height={16}
														className="flex-shrink-0"
													/>
												) : null}
												{modelHref ? (
													<Link
														href={modelHref}
														className="truncate underline decoration-transparent transition-colors duration-200 hover:text-primary hover:decoration-current"
														title={job.model ?? undefined}
														onClick={stopRowClick}
													>
														{modelLabel}
													</Link>
												) : (
													<div
														className="truncate font-medium text-foreground"
														title={job.model ?? undefined}
													>
														{modelLabel}
													</div>
												)}
											</div>
										</div>
									</TableCell>
								) : (
									<TableCell>
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<Icon className="h-4 w-4 text-muted-foreground" />
												<span className="font-medium capitalize">{job.kind}</span>
												<span className="font-mono text-xs text-muted-foreground">{job.internal_id}</span>
											</div>
											<div className="text-xs text-muted-foreground">
												{job.provider ?? "Unknown provider"}
												{job.model ? ` · ${job.model}` : ""}
											</div>
											{failureSummary ? (
												<div className="text-xs text-rose-700 line-clamp-2">
													{failureSummary}
												</div>
											) : null}
											<AsyncJobAppBadge
												appId={job.app_id}
												appLabel={appLabel}
												href={appHref}
											/>
										</div>
									</TableCell>
								)}
								{variant === "logs" ? (
									<TableCell className="py-2">
										{job.provider ? (
											<Badge
												variant="outline"
												className="inline-flex items-center gap-2"
											>
												<Logo
													id={job.provider}
													width={14}
													height={14}
													className="flex-shrink-0"
												/>
												<span className="truncate">{providerLabel}</span>
											</Badge>
										) : (
											<Badge variant="outline">-</Badge>
										)}
									</TableCell>
								) : null}
								{variant === "logs" ? (
									<TableCell className="py-2">
										<div className="space-y-1">
											<div className="flex items-center gap-2">
												<Badge
													variant="outline"
													className="inline-flex items-center gap-2 capitalize"
												>
													<Icon className="h-3.5 w-3.5 text-muted-foreground" />
													{job.kind}
												</Badge>
											</div>
											<AsyncJobAppBadge
												appId={job.app_id}
												appLabel={appLabel}
												href={appHref}
											/>
										</div>
									</TableCell>
								) : null}
								{variant === "logs" ? (
									<TableCell className="py-2 text-right font-mono text-xs">
										{job.kind === "batch" && (job.settled_cost_nanos != null || job.settled_cost_usd != null)
											? formatSettledCost(job)
											: formatMoneyFromNanos(job.request_cost_nanos)}
									</TableCell>
								) : null}
								<TableCell>
									<div className="space-y-1">
										<JobStatusBadge status={job.status} />
										{failureSummary ? (
											<div className="max-w-[220px] text-xs text-rose-700 line-clamp-2">
												{failureSummary}
											</div>
										) : null}
									</div>
								</TableCell>
								{variant === "logs" ? null : (
									<TableCell>
										<div className="space-y-1 text-xs">
											<div>{job.webhook.delivered_events} delivered</div>
											<div className="text-muted-foreground">
												{job.webhook.pending_retries > 0
													? `${job.webhook.pending_retries} pending retry`
													: job.webhook.configured
														? "No pending retries"
														: "No webhook configured"}
											</div>
										</div>
									</TableCell>
								)}
								{variant === "logs" ? null : (
									<TableCell>
										<div className="space-y-1 text-xs">
											<div>{formatTimestamp(job.webhook.last_attempt_at)}</div>
											{job.webhook.last_attempt_status ? (
												<div className="text-muted-foreground">{job.webhook.last_attempt_status}</div>
											) : null}
										</div>
									</TableCell>
								)}
								{variant === "logs" ? null : (
									<TableCell className="text-xs">
										<div className="flex items-center gap-2 text-muted-foreground">
											<Clock3 className="h-3.5 w-3.5" />
											{formatTimestamp(job.webhook.next_retry_at)}
										</div>
										{job.webhook.last_error_message ? (
											<div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
												<AlertTriangle className="mt-0.5 h-3 w-3" />
												<span className="line-clamp-2">{job.webhook.last_error_message}</span>
											</div>
										) : null}
									</TableCell>
								)}
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	</>
	);

	return (
		<>
			{variant === "card" ? (
				<Card>
					<CardHeader className="flex flex-row items-start justify-between gap-4">
						<div className="space-y-1">
							<CardTitle>{title}</CardTitle>
							<CardDescription>{description}</CardDescription>
						</div>
						{showRefreshButton ? (
							<Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isRefreshing}>
								<RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
								Refresh
							</Button>
						) : null}
					</CardHeader>
					<CardContent>{table}</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{showRefreshButton ? (
						<div className="flex items-center justify-end">
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={refresh}
								disabled={isRefreshing}
								aria-label="Refresh jobs"
							>
								<RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
							</Button>
						</div>
					) : null}
					{table}
				</div>
			)}

			<AsyncJobDetailDialog
				job={selectedJob}
				modelMetadata={resolvedModelMetadata}
				providerNames={resolvedProviderNames}
				appMetadata={resolvedAppMetadata}
				open={open}
				onInspectRequest={openRequestDetail}
				isInspectingRequest={isLoadingRequestDetail}
				onOpenChange={(nextOpen) => {
					setOpen(nextOpen);
					if (!nextOpen) {
						setSelectedJob(null);
					}
				}}
			/>

			<RequestDetailDialog
				open={requestDetailOpen}
				onOpenChange={(nextOpen) => {
					setRequestDetailOpen(nextOpen);
					if (!nextOpen) {
						setSelectedRequest(null);
					}
				}}
				request={selectedRequest}
				appName={requestDetailAppName}
				modelMetadata={requestDetailModelMetadata}
				providerName={
					selectedRequest?.provider
						? requestDetailProviderNames.get(selectedRequest.provider) ??
							selectedRequest.provider
						: null
				}
				providerNames={requestDetailProviderNames}
				providerMetadata={requestDetailProviderMetadata}
			/>

			{isLoadingDetail || isLoadingRequestDetail ? (
				<div className="sr-only">
					{isLoadingDetail
						? "Loading async job details..."
						: "Loading request details..."}
				</div>
			) : null}
		</>
	);
}
